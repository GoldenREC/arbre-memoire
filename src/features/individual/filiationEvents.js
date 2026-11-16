import { supabase } from '../../lib/supabaseClient.js';
import { attachDateProof } from './actsMutations.js';
import { findOrCreatePlace } from './individualMutations.js';

/** Type de lien → type d'événement qui porte la date et le lieu sur l'enfant. */
export const FILIATION_EVENT_TYPE = {
  adoption_plenary: 'adoption',
  adoption_simple: 'adoption',
  foster: 'foster_placement',
  late_recognition: 'recognition',
  abandoned: 'abandonment',
};

export const FILIATION_EVENT_LABEL = {
  adoption: 'Adoption',
  foster_placement: "Mise en famille d'accueil",
  recognition: 'Reconnaissance',
  abandonment: 'Abandon',
};

/** Libellé de la question posée à côté de la date et du lieu. */
export const FILIATION_EVENT_QUESTION = {
  adoption: "date et lieu de l'adoption",
  foster_placement: "date et lieu de la mise en famille d'accueil",
  recognition: 'date et lieu de la reconnaissance',
  abandonment: "date et lieu de l'abandon",
};

export function filiationNeedsEvent(type) {
  return !!FILIATION_EVENT_TYPE[type];
}

/**
 * Enregistre la date, le lieu et la preuve d'un lien daté. Chaque lien a son
 * propre événement (filiations.event_id), donc deux adoptions du même parent
 * (plénière puis simple) ne se remplacent pas. La preuve passe par
 * attachDateProof, comme pour la naissance. Renvoie l'id de l'événement, ou
 * null s'il n'y a ni date ni lieu.
 */
export async function saveFiliationEvent(treeId, { filiationId, eventId, childId, childName, filiationType, date, placeLabel, proof }) {
  const eventType = FILIATION_EVENT_TYPE[filiationType];
  const hasDate = !!date;
  const hasPlace = !!placeLabel?.trim();
  if (!eventType || (!hasDate && !hasPlace)) return null;

  const placeId = hasPlace ? await findOrCreatePlace(treeId, placeLabel) : null;
  const datePatch = { event_date: date || null, date_precision: hasDate ? 'exact' : 'unknown', place_id: placeId };
  const title = `${FILIATION_EVENT_LABEL[eventType]} — ${childName || ''}`.trim();

  let id = eventId;
  if (id) {
    const { error } = await supabase.from('events').update(datePatch).eq('id', id);
    if (error) throw error;
  } else {
    const { data, error } = await supabase
      .from('events')
      .insert({
        tree_id: treeId,
        subject_kind: 'individual',
        subject_id: childId,
        event_type: eventType,
        label: title,
        proof_level: 'hypothesis',
        ...datePatch,
      })
      .select('id')
      .single();
    if (error) throw error;
    id = data.id;
    const { error: linkErr } = await supabase.from('filiations').update({ event_id: id }).eq('id', filiationId);
    if (linkErr) throw linkErr;
  }

  await attachDateProof(treeId, {
    subjectId: childId,
    individualId: childId,
    eventType,
    eventId: id,
    snapshot: { date: date || null, datePrecision: hasDate ? 'exact' : 'unknown', placeId },
    title,
    proof,
  });
  return id;
}
