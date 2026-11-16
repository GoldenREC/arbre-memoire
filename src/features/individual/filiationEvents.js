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

/** Événement existant (date, lieu) pour un enfant et un type de lien, s'il y en a un. */
export async function fetchFiliationEvent(childId, filiationType) {
  const eventType = FILIATION_EVENT_TYPE[filiationType];
  if (!eventType) return null;
  const { data, error } = await supabase
    .from('events')
    .select('id, event_date, places(raw_label)')
    .eq('subject_kind', 'individual')
    .eq('subject_id', childId)
    .eq('event_type', eventType)
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data ? { id: data.id, date: data.event_date || '', placeLabel: data.places?.raw_label || '' } : null;
}

/**
 * Enregistre la date, le lieu et la preuve d'un lien daté. La preuve passe par
 * attachDateProof (acte ou informations familiales), comme pour la naissance.
 * Renvoie l'id de l'événement, ou null s'il n'y a ni date ni lieu.
 */
export async function saveFiliationEvent(treeId, { childId, childName, filiationType, date, placeLabel, proof }) {
  const eventType = FILIATION_EVENT_TYPE[filiationType];
  const hasDate = !!date;
  const hasPlace = !!placeLabel?.trim();
  if (!eventType || (!hasDate && !hasPlace)) return null;

  const placeId = hasPlace ? await findOrCreatePlace(treeId, placeLabel) : null;
  const title = `${FILIATION_EVENT_LABEL[eventType]} — ${childName || ''}`.trim();
  const { eventId } = await attachDateProof(treeId, {
    subjectId: childId,
    individualId: childId,
    eventType,
    snapshot: { date: date || null, datePrecision: hasDate ? 'exact' : 'unknown', placeId },
    title,
    proof,
  });

  // ensureEvent ne met pas à jour un événement déjà présent : on corrige la date et le lieu.
  const { error } = await supabase
    .from('events')
    .update({ event_date: date || null, date_precision: hasDate ? 'exact' : 'unknown', place_id: placeId })
    .eq('id', eventId);
  if (error) throw error;
  return eventId;
}
