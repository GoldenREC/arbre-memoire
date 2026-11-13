/**
 * Upload et lecture des fichiers média (actes scannés, photos) dans le
 * bucket Supabase Storage "media" (voir supabase/storage.sql). Le
 * bucket est privé : toute lecture passe par une URL signée à durée
 * limitée plutôt que par un accès public.
 *
 * Organisation du bucket : deux sous-dossiers distincts sous chaque
 * arbre — "actes/" (documents originaux rattachés à une source,
 * photographies d'archives) et "photos/" (portraits, photos de
 * famille, animaux). Le premier segment du chemin reste le tree_id,
 * seul segment dont dépend la politique RLS du bucket (voir
 * storage.sql) : ce sous-dossier n'a donc aucun impact sur les droits,
 * il structure uniquement l'arborescence pour qui consulte le bucket
 * directement depuis le tableau de bord Supabase.
 */
import { supabase } from '../supabaseClient.js';

const BUCKET = 'media';

function folderFor({ folder, mediaType, sourceId }) {
  if (folder) return folder;
  // Un média rattaché à une source (acte, document d'archive) va dans
  // "actes/" ; tout le reste (portraits, photos de famille, animaux)
  // va dans "photos/".
  return sourceId || mediaType === 'document' ? 'actes' : 'photos';
}

export async function uploadMediaFile(treeId, file, { mediaType = 'document', sourceId = null, title = null, description = null, folder = null } = {}) {
  const { data: mediaRow, error: insertErr } = await supabase
    .from('media')
    .insert({ tree_id: treeId, media_type: mediaType, storage_path: 'pending', title, description, source_id: sourceId })
    .select('id')
    .single();
  if (insertErr) throw insertErr;

  const safeName = file.name.replace(/[^a-zA-Z0-9.\-_]/g, '_');
  const path = `${treeId}/${folderFor({ folder, mediaType, sourceId })}/${mediaRow.id}-${safeName}`;

  const { error: uploadErr } = await supabase.storage.from(BUCKET).upload(path, file, { upsert: true, contentType: file.type });
  if (uploadErr) {
    await supabase.from('media').delete().eq('id', mediaRow.id);
    throw uploadErr;
  }

  const { error: updateErr } = await supabase.from('media').update({ storage_path: path }).eq('id', mediaRow.id);
  if (updateErr) throw updateErr;

  return mediaRow.id;
}

export async function getMediaSignedUrl(storagePath, expiresIn = 3600) {
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(storagePath, expiresIn);
  if (error) throw error;
  return data.signedUrl;
}

export async function deleteMedia(mediaId, storagePath) {
  if (storagePath) await supabase.storage.from(BUCKET).remove([storagePath]);
  const { error } = await supabase.from('media').delete().eq('id', mediaId);
  if (error) throw error;
}

export async function updateMediaInfo(mediaId, patch) {
  const { error } = await supabase.from('media').update(patch).eq('id', mediaId);
  if (error) throw error;
}

/** Télécharge le contenu binaire d'un média (utilisé par l'export JSON). */
export async function downloadMediaBlob(storagePath) {
  const { data, error } = await supabase.storage.from(BUCKET).download(storagePath);
  if (error) throw error;
  return data; // Blob
}
