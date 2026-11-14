/**
 * Scans en double sur une même source : le même fichier rattaché deux ou
 * trois fois (ré-imports, puis fusions de sources qui ont regroupé leurs
 * scans). Deux scans sont le même fichier s'ils sont sur la même source,
 * portent le même nom de fichier ET font exactement le même poids dans le
 * stockage — sans poids connu, on ne supprime rien. On garde le plus
 * ancien (ou celui qui porte une transcription).
 */
import { supabase } from '../supabaseClient.js';
import { deleteMedia } from './mediaStorage.js';

const BUCKET = 'media';

/** Nom de fichier d'origine : le chemin est "<arbre>/<dossier>/<id média>-<nom>". */
function originalName(media) {
  const base = (media.storage_path || '').split('/').pop() || '';
  return base.startsWith(`${media.id}-`) ? base.slice(media.id.length + 1) : media.title || base;
}

/** Fonction pure : liste des médias à supprimer. `sizeByPath` : Map chemin -> taille en octets. */
export function planDuplicateScanRemoval(mediaRows, sizeByPath) {
  const groups = new Map();
  for (const m of mediaRows) {
    if (!m.source_id) continue;
    const size = sizeByPath.get(m.storage_path);
    if (!size) continue; // poids inconnu : on ne prend aucun risque
    const key = `${m.source_id}|${originalName(m).toLowerCase()}|${size}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(m);
  }
  const toRemove = [];
  for (const group of groups.values()) {
    if (group.length < 2) continue;
    const sorted = [...group].sort(
      (a, b) => Number(!!b.description) - Number(!!a.description) || (a.created_at || '').localeCompare(b.created_at || '') || a.id.localeCompare(b.id)
    );
    toRemove.push(...sorted.slice(1));
  }
  return toRemove;
}

async function listFolderSizes(folder) {
  const sizes = new Map();
  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await supabase.storage.from(BUCKET).list(folder, { limit: 1000, offset });
    if (error) throw error;
    for (const f of data || []) {
      if (f.metadata?.size) sizes.set(`${folder}/${f.name}`, f.metadata.size);
    }
    if (!data || data.length < 1000) break;
  }
  return sizes;
}

/** Supprime les scans en double de tout l'arbre. Retourne le nombre de scans supprimés. */
export async function removeDuplicateScans(treeId) {
  const { data: mediaRows, error } = await supabase
    .from('media')
    .select('id, source_id, title, description, storage_path, created_at')
    .eq('tree_id', treeId)
    .not('source_id', 'is', null);
  if (error) throw error;

  const folders = new Set((mediaRows || []).map((m) => (m.storage_path || '').split('/').slice(0, -1).join('/')).filter(Boolean));
  const sizeByPath = new Map();
  for (const folder of folders) {
    for (const [path, size] of await listFolderSizes(folder)) sizeByPath.set(path, size);
  }

  const toRemove = planDuplicateScanRemoval(mediaRows || [], sizeByPath);
  for (const m of toRemove) await deleteMedia(m.id, m.storage_path);
  return toRemove.length;
}
