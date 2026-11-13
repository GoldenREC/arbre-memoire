/**
 * Écritures et lectures pour la galerie photo : liste générale,
 * upload, tags de visages (media_face_tags) et rattachements
 * génériques (media_links) vers un individu, une union ou un animal.
 * Les actes (documents rattachés à une source) restent gérés par
 * sourcesMutations.js / actsMutations.js — ce fichier ne concerne que
 * les médias de type "photo".
 */
import { supabase } from '../../lib/supabaseClient.js';
import { uploadMediaFile } from '../../lib/db/mediaStorage.js';
import { applyPrivacyRules } from '../../lib/utils/privacy.js';

const PHOTO_COLUMNS = 'id, storage_path, title, description, taken_at, created_at';

export async function listPhotos(treeId) {
  const { data, error } = await supabase
    .from('media')
    .select(PHOTO_COLUMNS)
    .eq('tree_id', treeId)
    .eq('media_type', 'photo')
    .order('taken_at', { ascending: true, nullsFirst: false });
  if (error) throw error;
  return data || [];
}

export async function uploadPhoto(treeId, file, { title, takenAt } = {}) {
  const mediaId = await uploadMediaFile(treeId, file, { mediaType: 'photo', title: title || file.name, folder: 'photos' });
  if (takenAt) {
    const { error } = await supabase.from('media').update({ taken_at: takenAt }).eq('id', mediaId);
    if (error) throw error;
  }
  return mediaId;
}

export async function updatePhotoInfo(mediaId, patch) {
  const row = {};
  if (patch.title !== undefined) row.title = patch.title || null;
  if (patch.description !== undefined) row.description = patch.description || null;
  if (patch.takenAt !== undefined) row.taken_at = patch.takenAt || null;
  const { error } = await supabase.from('media').update(row).eq('id', mediaId);
  if (error) throw error;
}

// ---------------------------------------------------------------------
// Tags de visages (identification de personnes sur une photo de groupe)
// ---------------------------------------------------------------------

/**
 * Tags d'une photo, avec l'individu identifié résolu — masqué selon
 * les mêmes règles RGPD que le reste de l'app si le rôle courant n'a
 * pas le droit de voir le détail d'une personne vivante (une galerie
 * de photos est visible par tous les membres, y compris les invités).
 */
export async function listFaceTags(mediaId, role, privacyThresholdYears = 100) {
  const { data, error } = await supabase
    .from('media_face_tags')
    .select('id, individual_id, x, y, width, height')
    .eq('media_id', mediaId);
  if (error) throw error;
  if (!data?.length) return [];

  const individualIds = [...new Set(data.map((t) => t.individual_id))];
  const { data: inds, error: indErr } = await supabase
    .from('individuals')
    .select('id, first_names, last_name, birth_date, death_date, is_deceased')
    .in('id', individualIds);
  if (indErr) throw indErr;

  const mapped = (inds || []).map((i) => ({
    id: i.id,
    firstNames: i.first_names,
    lastName: i.last_name,
    birthDate: i.birth_date,
    deathDate: i.death_date,
    isDeceased: i.is_deceased,
  }));
  const privacyApplied = applyPrivacyRules(mapped, role, privacyThresholdYears);
  const indsById = new Map(privacyApplied.map((i) => [i.id, i]));

  return data.map((t) => ({
    id: t.id,
    individualId: t.individual_id,
    x: t.x,
    y: t.y,
    width: t.width,
    height: t.height,
    individual: indsById.get(t.individual_id) || null,
  }));
}

export async function addFaceTag(mediaId, individualId, rect) {
  const { error } = await supabase
    .from('media_face_tags')
    .insert({ media_id: mediaId, individual_id: individualId, x: rect.x, y: rect.y, width: rect.width, height: rect.height });
  if (error) throw error;
}

export async function removeFaceTag(tagId) {
  const { error } = await supabase.from('media_face_tags').delete().eq('id', tagId);
  if (error) throw error;
}

// ---------------------------------------------------------------------
// Rattachements génériques (media_links) — ex: une photo associée à un
// animal ou à une union, sans qu'il s'agisse d'un visage identifié.
// ---------------------------------------------------------------------

export async function listMediaLinks(mediaId) {
  const { data, error } = await supabase.from('media_links').select('subject_kind, subject_id').eq('media_id', mediaId);
  if (error) throw error;
  return data || [];
}

export async function linkMediaToSubject(mediaId, subjectKind, subjectId) {
  const { error } = await supabase
    .from('media_links')
    .upsert({ media_id: mediaId, subject_kind: subjectKind, subject_id: subjectId }, { onConflict: 'media_id,subject_kind,subject_id' });
  if (error) throw error;
}

export async function unlinkMediaFromSubject(mediaId, subjectKind, subjectId) {
  const { error } = await supabase.from('media_links').delete().match({ media_id: mediaId, subject_kind: subjectKind, subject_id: subjectId });
  if (error) throw error;
}

// ---------------------------------------------------------------------
// Photos d'un individu (identifié par tag OU rattaché directement) et
// d'un animal — alimentent respectivement l'onglet "Photos & animaux"
// de la fiche individu et la fiche détaillée d'un animal.
// ---------------------------------------------------------------------

export async function listPhotosForIndividual(individualId) {
  const [{ data: tagRows, error: tErr }, { data: linkRows, error: lErr }] = await Promise.all([
    supabase.from('media_face_tags').select('media_id').eq('individual_id', individualId),
    supabase.from('media_links').select('media_id').eq('subject_kind', 'individual').eq('subject_id', individualId),
  ]);
  if (tErr) throw tErr;
  if (lErr) throw lErr;
  const mediaIds = [...new Set([...(tagRows || []).map((r) => r.media_id), ...(linkRows || []).map((r) => r.media_id)])];
  return fetchPhotosByIds(mediaIds);
}

export async function listPhotosForPet(petId) {
  const { data: linkRows, error } = await supabase.from('media_links').select('media_id').eq('subject_kind', 'pet').eq('subject_id', petId);
  if (error) throw error;
  return fetchPhotosByIds([...new Set((linkRows || []).map((r) => r.media_id))]);
}

async function fetchPhotosByIds(mediaIds) {
  if (!mediaIds.length) return [];
  const { data, error } = await supabase
    .from('media')
    .select(PHOTO_COLUMNS)
    .in('id', mediaIds)
    .order('taken_at', { ascending: true, nullsFirst: false });
  if (error) throw error;
  return data || [];
}
