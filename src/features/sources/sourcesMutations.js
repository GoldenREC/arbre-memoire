import { supabase } from '../../lib/supabaseClient.js';
import { deleteMedia } from '../../lib/db/mediaStorage.js';

export async function listSources(treeId) {
  const { data, error } = await supabase
    .from('sources')
    .select('id, title, repository, call_number, url, notes, source_type')
    .eq('tree_id', treeId)
    .order('title');
  if (error) throw error;

  // Pour chaque source : les types d'événements qu'elle prouve et les
  // personnes concernées (via ses citations) — filtres et libellés du
  // gestionnaire de sources (voir sourceFilters.js). Pour un événement
  // d'union (mariage, mise en couple, divorce), les deux conjoints.
  const [
    { data: citations, error: citErr },
    { data: events, error: evErr },
    { data: individuals, error: indErr },
    { data: partners, error: partErr },
  ] = await Promise.all([
    supabase.from('citations').select('source_id, event_id, individual_id').eq('tree_id', treeId),
    supabase.from('events').select('id, event_type, subject_kind, subject_id').eq('tree_id', treeId),
    supabase.from('individuals').select('id, first_names, last_name').eq('tree_id', treeId),
    supabase.from('union_partners').select('union_id, individual_id, unions!inner(tree_id)').eq('unions.tree_id', treeId),
  ]);
  for (const err of [citErr, evErr, indErr, partErr]) if (err) throw err;

  return attachSourceUsage(data || [], { citations: citations || [], events: events || [], individuals: individuals || [], partners: partners || [] });
}

/** Fonction pure (testée) : ajoute `eventTypes` et `subjects` (noms) à chaque source. */
export function attachSourceUsage(sources, { citations, events, individuals, partners }) {
  const nameById = new Map(individuals.map((i) => [i.id, `${i.first_names || ''} ${i.last_name || ''}`.trim() || 'Sans nom']));
  const partnersByUnion = new Map();
  for (const p of partners) {
    if (!partnersByUnion.has(p.union_id)) partnersByUnion.set(p.union_id, []);
    partnersByUnion.get(p.union_id).push(p.individual_id);
  }
  const eventById = new Map(events.map((e) => [e.id, e]));

  const usage = new Map();
  const entry = (sourceId) => {
    if (!usage.has(sourceId)) usage.set(sourceId, { eventTypes: new Set(), subjects: new Set() });
    return usage.get(sourceId);
  };
  for (const c of citations) {
    const u = entry(c.source_id);
    const event = eventById.get(c.event_id);
    if (event) {
      u.eventTypes.add(event.event_type);
      if (event.subject_kind === 'union') {
        const names = (partnersByUnion.get(event.subject_id) || []).map((id) => nameById.get(id)).filter(Boolean);
        if (names.length) u.subjects.add(names.join(' & '));
      } else if (nameById.has(event.subject_id)) {
        u.subjects.add(nameById.get(event.subject_id));
      }
    } else if (c.individual_id && nameById.has(c.individual_id)) {
      u.subjects.add(nameById.get(c.individual_id));
    }
  }
  return sources.map((s) => ({
    ...s,
    eventTypes: [...(usage.get(s.id)?.eventTypes || [])],
    subjects: [...(usage.get(s.id)?.subjects || [])],
  }));
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

/**
 * Supprime une source, ses citations (en cascade) et ses actes scannés.
 * Les scans doivent partir en premier : la base refuse de supprimer une
 * source à laquelle un fichier est encore rattaché (c'est ce qui faisait
 * échouer le bouton "Supprimer la source" sans message).
 */
export async function deleteSource(sourceId) {
  const media = await listMediaForSource(sourceId);
  for (const m of media) await deleteMedia(m.id, m.storage_path);
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
