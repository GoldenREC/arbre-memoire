/**
 * Écritures spécifiques aux pastilles N/M/D : lister les actes déjà
 * rattachés à un événement donné, en attacher un nouveau (création
 * d'une source + upload en une seule étape) ou un existant, et
 * détacher une citation. S'appuie sur les mêmes briques que le
 * gestionnaire de sources (sourcesMutations.js, mediaStorage.js) pour
 * ne pas dupliquer la logique d'écriture.
 */
import { supabase } from '../../lib/supabaseClient.js';
import { createSource } from '../sources/sourcesMutations.js';
import { uploadMediaFile } from '../../lib/db/mediaStorage.js';
import { addCitation } from './individualMutations.js';

/** Actes (médias) déjà rattachés à un événement, via les citations qui le citent. */
export async function listActsForEvent(eventId) {
  if (!eventId) return [];
  const { data: citations, error } = await supabase
    .from('citations')
    .select('id, source_id, transcription, page_ref')
    .eq('event_id', eventId);
  if (error) throw error;
  if (!citations?.length) return [];

  const sourceIds = [...new Set(citations.map((c) => c.source_id))];
  const [{ data: sources, error: sErr }, { data: mediaRows, error: mErr }] = await Promise.all([
    supabase.from('sources').select('id, title, repository').in('id', sourceIds),
    supabase.from('media').select('id, storage_path, title, media_type, description, source_id').in('source_id', sourceIds),
  ]);
  if (sErr) throw sErr;
  if (mErr) throw mErr;

  const sourcesById = new Map((sources || []).map((s) => [s.id, s]));
  const mediaBySource = new Map();
  for (const m of mediaRows || []) {
    if (!mediaBySource.has(m.source_id)) mediaBySource.set(m.source_id, []);
    mediaBySource.get(m.source_id).push(m);
  }

  return citations.map((c) => ({
    id: c.id,
    sourceId: c.source_id,
    transcription: c.transcription,
    pageRef: c.page_ref,
    source: sourcesById.get(c.source_id) || null,
    media: mediaBySource.get(c.source_id) || [],
  }));
}

/** Crée une nouvelle source à la volée, y attache le fichier envoyé, puis cite l'événement. */
export async function attachNewAct(treeId, { eventId, individualId = null, title, file }) {
  const sourceId = await createSource(treeId, { title });
  const mediaId = await uploadMediaFile(treeId, file, { mediaType: 'document', sourceId, title: file.name, folder: 'actes' });
  await addCitation(treeId, { eventId, individualId, sourceId });
  return { sourceId, mediaId };
}

/** Rattache une source déjà existante (créée depuis le gestionnaire de sources) à l'événement. */
export async function attachExistingSource(treeId, { eventId, individualId = null, sourceId, transcription }) {
  await addCitation(treeId, { eventId, individualId, sourceId, transcription });
}

/** Détache l'acte de l'événement (supprime la citation, conserve la source pour un usage ailleurs). */
export async function detachCitation(citationId) {
  const { error } = await supabase.from('citations').delete().eq('id', citationId);
  if (error) throw error;
}
