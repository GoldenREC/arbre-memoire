import { supabase } from '../../lib/supabaseClient.js';

export async function listSources(treeId) {
  const { data, error } = await supabase
    .from('sources')
    .select('id, title, repository, call_number, url, notes, source_type')
    .eq('tree_id', treeId)
    .order('title');
  if (error) throw error;
  return data || [];
}

export async function createSource(treeId, patch) {
  const { data, error } = await supabase
    .from('sources')
    .insert({
      tree_id: treeId,
      title: patch.title,
      repository: patch.repository || null,
      call_number: patch.callNumber || null,
      url: patch.url || null,
      notes: patch.notes || null,
      source_type: patch.sourceType || null,
    })
    .select('id')
    .single();
  if (error) throw error;
  return data.id;
}

export async function updateSource(sourceId, patch) {
  const { error } = await supabase
    .from('sources')
    .update({
      title: patch.title,
      repository: patch.repository || null,
      call_number: patch.callNumber || null,
      url: patch.url || null,
      notes: patch.notes || null,
      source_type: patch.sourceType || null,
    })
    .eq('id', sourceId);
  if (error) throw error;
}

export async function deleteSource(sourceId) {
  const { error } = await supabase.from('sources').delete().eq('id', sourceId);
  if (error) throw error;
}

export async function listMediaForSource(sourceId) {
  const { data, error } = await supabase
    .from('media')
    .select('id, media_type, storage_path, title, description, created_at')
    .eq('source_id', sourceId)
    .order('created_at');
  if (error) throw error;
  return data || [];
}

/**
 * Qui cite cette source : résout l'individu concerné (directement, ou
 * via l'événement cité) et l'indice de preuve de l'événement associé,
 * pour affichage dans SourceDetailModal.
 */
export async function listCitationsForSource(sourceId) {
  const { data: citations, error } = await supabase
    .from('citations')
    .select('id, event_id, individual_id, transcription, page_ref')
    .eq('source_id', sourceId);
  if (error) throw error;
  if (!citations?.length) return [];

  const eventIds = citations.filter((c) => c.event_id).map((c) => c.event_id);
  let eventsById = new Map();
  const individualIds = new Set(citations.filter((c) => c.individual_id).map((c) => c.individual_id));

  if (eventIds.length) {
    const { data: events, error: evErr } = await supabase
      .from('events')
      .select('id, event_type, label, subject_kind, subject_id, proof_level')
      .in('id', eventIds);
    if (evErr) throw evErr;
    eventsById = new Map(events.map((e) => [e.id, e]));
    for (const e of events) if (e.subject_kind === 'individual') individualIds.add(e.subject_id);
  }

  let individualsById = new Map();
  if (individualIds.size) {
    const { data: inds, error: indErr } = await supabase
      .from('individuals')
      .select('id, first_names, last_name')
      .in('id', [...individualIds]);
    if (indErr) throw indErr;
    individualsById = new Map(inds.map((i) => [i.id, i]));
  }

  return citations.map((c) => {
    const event = c.event_id ? eventsById.get(c.event_id) : null;
    const individualId = c.individual_id || (event?.subject_kind === 'individual' ? event.subject_id : null);
    return {
      id: c.id,
      transcription: c.transcription,
      pageRef: c.page_ref,
      event,
      individual: individualId ? individualsById.get(individualId) : null,
      proofLevel: event?.proof_level || null,
    };
  });
}
