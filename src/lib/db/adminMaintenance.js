import { supabase } from '../supabaseClient.js';

const BUCKET = 'media';
const MEDIA_SUBFOLDERS = ['actes', 'photos'];

/**
 * Compare le contenu réel du bucket Storage (dossiers "actes/" et
 * "photos/" de l'arbre) à la table `media` pour repérer les fichiers
 * orphelins : présents dans le Storage mais plus référencés par aucune
 * fiche média (ex. après un échec d'upload partiel, ou un média
 * supprimé directement en base). Ne supprime rien — simple aperçu,
 * voir deleteOrphanedFiles() pour l'action.
 */
export async function listOrphanedMediaFiles(treeId) {
  const { data: mediaRows, error: mediaErr } = await supabase.from('media').select('storage_path').eq('tree_id', treeId);
  if (mediaErr) throw mediaErr;
  const knownPaths = new Set((mediaRows || []).map((m) => m.storage_path));

  const orphans = [];
  for (const sub of MEDIA_SUBFOLDERS) {
    const { data: files, error } = await supabase.storage.from(BUCKET).list(`${treeId}/${sub}`, { limit: 1000 });
    if (error) throw error;
    for (const f of files || []) {
      if (!f.name || f.id === null) continue; // Supabase renvoie id=null pour un placeholder de sous-dossier, pas un vrai fichier
      const path = `${treeId}/${sub}/${f.name}`;
      if (!knownPaths.has(path)) {
        orphans.push({ path, sizeBytes: f.metadata?.size ?? null, lastModified: f.updated_at || f.created_at || null });
      }
    }
  }
  return orphans;
}

/** Supprime les fichiers orphelins sélectionnés (après confirmation explicite côté UI). */
export async function deleteOrphanedFiles(paths) {
  if (!paths.length) return;
  const { error } = await supabase.storage.from(BUCKET).remove(paths);
  if (error) throw error;
}

/**
 * Journal d'activité d'un arbre : les N dernières modifications toutes
 * fiches confondues (admin), enrichi de l'e-mail de l'auteur via
 * `profiles`. Alimenté par les déclencheurs record_history (voir
 * supabase/settings.sql) — personne n'est exempté du suivi, admin
 * compris.
 */
export async function fetchRecordHistory(treeId, { tableName = null, recordId = null, limit = 100 } = {}) {
  let query = supabase
    .from('record_history')
    .select('id, table_name, record_id, operation, changed_by, changed_at, changes')
    .eq('tree_id', treeId)
    .order('changed_at', { ascending: false })
    .limit(limit);
  if (tableName) query = query.eq('table_name', tableName);
  if (recordId) query = query.eq('record_id', recordId);

  const { data: rows, error } = await query;
  if (error) throw error;

  const authorIds = [...new Set((rows || []).map((r) => r.changed_by).filter(Boolean))];
  let emailById = new Map();
  if (authorIds.length) {
    const { data: profileRows, error: profErr } = await supabase.from('profiles').select('id, email').in('id', authorIds);
    if (profErr) throw profErr;
    emailById = new Map((profileRows || []).map((p) => [p.id, p.email]));
  }

  return (rows || []).map((r) => ({
    id: r.id,
    tableName: r.table_name,
    recordId: r.record_id,
    operation: r.operation,
    changedBy: r.changed_by,
    changedByEmail: r.changed_by ? emailById.get(r.changed_by) || null : null,
    changedAt: r.changed_at,
    changes: r.changes || {},
  }));
}

/** Historique d'une seule fiche (onglet "Historique" d'une fiche individu, union…). */
export async function fetchRecordHistoryFor(treeId, tableName, recordId) {
  return fetchRecordHistory(treeId, { tableName, recordId, limit: 200 });
}
