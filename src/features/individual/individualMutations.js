/**
 * Toutes les écritures déclenchées depuis la fiche individu : état
 * civil, liens familiaux (parents/conjoints/enfants), événements et
 * citations. Regroupées ici pour que IndividualDetailView et ses
 * sous-composants restent des composants d'affichage.
 */
import { supabase } from '../../lib/supabaseClient.js';

/** Retrouve un lieu existant par libellé normalisé, sinon le crée. */
export async function findOrCreatePlace(treeId, rawLabel) {
  const trimmed = rawLabel?.trim();
  if (!trimmed) return null;
  const normalized = trimmed.toLowerCase();

  const { data: existing, error: findErr } = await supabase
    .from('places')
    .select('id')
    .eq('tree_id', treeId)
    .eq('normalized', normalized)
    .limit(1)
    .maybeSingle();
  if (findErr) throw findErr;
  if (existing) return existing.id;

  const { data: created, error: createErr } = await supabase
    .from('places')
    .insert({ tree_id: treeId, raw_label: trimmed, normalized })
    .select('id')
    .single();
  if (createErr) throw createErr;
  return created.id;
}

/** Met à jour l'état civil (en-tête de la fiche). placesRaw : { birth, death }. */
export async function updateIndividualCivilInfo(individualId, treeId, patch, placesRaw = {}) {
  const birthPlaceId = placesRaw.birth !== undefined ? await findOrCreatePlace(treeId, placesRaw.birth) : undefined;
  const deathPlaceId = placesRaw.death !== undefined ? await findOrCreatePlace(treeId, placesRaw.death) : undefined;

  const row = {
    first_names: patch.firstNames ?? null,
    last_name: patch.lastName ?? null,
    birth_name: patch.birthName ?? null,
    nickname: patch.nickname ?? null,
    sex: patch.sex ?? 'U',
    birth_date: patch.birthDate ?? null,
    birth_date_precision: patch.birthDatePrecision ?? 'unknown',
    death_date: patch.deathDate ?? null,
    death_date_precision: patch.deathDatePrecision ?? 'unknown',
    is_deceased: !!patch.isDeceased,
    occupation: patch.occupation ?? null,
  };
  if (birthPlaceId !== undefined) row.birth_place_id = birthPlaceId;
  if (deathPlaceId !== undefined) row.death_place_id = deathPlaceId;

  const { error } = await supabase.from('individuals').update(row).eq('id', individualId);
  if (error) throw error;
}

export async function updateBiography(individualId, biography) {
  const { error } = await supabase.from('individuals').update({ biography }).eq('id', individualId);
  if (error) throw error;
}

// ---------------------------------------------------------------------
// Liens familiaux
// ---------------------------------------------------------------------

export async function addParentLink(treeId, childId, parentId, filiationType = 'biological') {
  const { error } = await supabase
    .from('filiations')
    .upsert({ tree_id: treeId, child_id: childId, parent_id: parentId, filiation_type: filiationType }, { onConflict: 'child_id,parent_id' });
  if (error) throw error;
}

export async function addChildLink(treeId, parentId, childId, filiationType = 'biological', unionId = null) {
  const { error } = await supabase
    .from('filiations')
    .upsert({ tree_id: treeId, child_id: childId, parent_id: parentId, filiation_type: filiationType, union_id: unionId }, { onConflict: 'child_id,parent_id' });
  if (error) throw error;
}

export async function removeFiliation(filiationId) {
  const { error } = await supabase.from('filiations').delete().eq('id', filiationId);
  if (error) throw error;
}

export async function createUnion(treeId, individualId, partnerId, info = {}) {
  const { data: union, error: unionErr } = await supabase
    .from('unions')
    .insert({
      tree_id: treeId,
      union_type: info.unionType || 'unknown',
      status: info.status || 'ongoing',
      start_date: info.startDate || null,
    })
    .select('id')
    .single();
  if (unionErr) throw unionErr;

  const { error: partnersErr } = await supabase
    .from('union_partners')
    .insert([
      { union_id: union.id, individual_id: individualId },
      { union_id: union.id, individual_id: partnerId },
    ]);
  if (partnersErr) throw partnersErr;
  return union.id;
}

export async function removeUnion(unionId) {
  const { error } = await supabase.from('unions').delete().eq('id', unionId);
  if (error) throw error; // ON DELETE CASCADE nettoie union_partners
}

// ---------------------------------------------------------------------
// Événements (chronologie, professions, résidences)
// ---------------------------------------------------------------------

export async function createEvent(treeId, subjectKind, subjectId, input) {
  const placeId = input.placeRaw ? await findOrCreatePlace(treeId, input.placeRaw) : null;
  const { data, error } = await supabase
    .from('events')
    .insert({
      tree_id: treeId,
      subject_kind: subjectKind,
      subject_id: subjectId,
      event_type: input.eventType,
      label: input.label || null,
      event_date: input.date || null,
      date_precision: input.datePrecision || 'unknown',
      place_id: placeId,
      description: input.description || null,
      proof_level: input.proofLevel || 'hypothesis',
    })
    .select('id')
    .single();
  if (error) throw error;
  return data.id;
}

/**
 * Retrouve l'événement "clé" (naissance / décès / mariage...) d'un
 * individu ou d'une union, ou le crée s'il n'existe pas encore —
 * utilisé par les pastilles N/M/D de la fiche individu : un acte ne
 * peut être rattaché qu'à un événement réel (table `events`), mais un
 * individu saisi à la main n'en a pas forcément un pour sa naissance
 * ou son décès (ces dates vivent directement sur `individuals`, voir
 * CivilHeader). On le crée alors à la volée, avec l'instantané de
 * date/lieu fourni par l'appelant, uniquement au moment où un premier
 * acte est effectivement rattaché.
 */
export async function ensureEvent(treeId, subjectKind, subjectId, eventType, snapshot = {}) {
  const { data: existing, error: findErr } = await supabase
    .from('events')
    .select('id')
    .eq('subject_kind', subjectKind)
    .eq('subject_id', subjectId)
    .eq('event_type', eventType)
    .limit(1)
    .maybeSingle();
  if (findErr) throw findErr;
  if (existing) return existing.id;

  const { data: created, error: createErr } = await supabase
    .from('events')
    .insert({
      tree_id: treeId,
      subject_kind: subjectKind,
      subject_id: subjectId,
      event_type: eventType,
      event_date: snapshot.date || null,
      date_precision: snapshot.datePrecision || 'unknown',
      place_id: snapshot.placeId || null,
      proof_level: 'hypothesis',
    })
    .select('id')
    .single();
  if (createErr) throw createErr;
  return created.id;
}

/** Changement rapide de l'indice de preuve d'un événement (pastilles N/M/D). */
export async function updateEventProofLevel(eventId, proofLevel) {
  const { error } = await supabase.from('events').update({ proof_level: proofLevel }).eq('id', eventId);
  if (error) throw error;
}

export async function updateEvent(eventId, treeId, input) {
  const placeId = input.placeRaw !== undefined ? await findOrCreatePlace(treeId, input.placeRaw) : undefined;
  const row = {
    event_type: input.eventType,
    label: input.label || null,
    event_date: input.date || null,
    date_precision: input.datePrecision || 'unknown',
    description: input.description || null,
    proof_level: input.proofLevel || 'hypothesis',
  };
  if (placeId !== undefined) row.place_id = placeId;

  const { error } = await supabase.from('events').update(row).eq('id', eventId);
  if (error) throw error;
}

export async function deleteEvent(eventId) {
  const { error } = await supabase.from('events').delete().eq('id', eventId);
  if (error) throw error;
}

// ---------------------------------------------------------------------
// Sources / citations
// ---------------------------------------------------------------------

export async function addCitation(treeId, { individualId, eventId, sourceId, transcription, pageRef }) {
  const { error } = await supabase.from('citations').insert({
    tree_id: treeId,
    source_id: sourceId,
    individual_id: individualId || null,
    event_id: eventId || null,
    transcription: transcription || null,
    page_ref: pageRef || null,
  });
  if (error) throw error;
}
