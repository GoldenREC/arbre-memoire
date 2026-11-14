/**
 * Toutes les écritures déclenchées depuis la fiche individu : état
 * civil, liens familiaux (parents/conjoints/enfants), événements et
 * citations. Regroupées ici pour que IndividualDetailView et ses
 * sous-composants restent des composants d'affichage.
 */
import { supabase } from '../../lib/supabaseClient.js';
import { toProperCase } from '../../lib/utils/properCase.js';
import { composePlaceLabel, isPlaceEmpty } from '../../lib/utils/placeLabel.js';

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

/**
 * Retrouve un lieu structuré existant (même libellé composé normalisé),
 * sinon le crée avec ses champs détaillés — pendant de findOrCreatePlace
 * pour le nouveau formulaire de création (lieu de naissance/décès en 9
 * champs, voir components/ui/StructuredPlaceInput.jsx). `place` : objet
 * { streetNumber, streetName, buildingName, arrondissement, city,
 * postalCode, department, region, country }. raw_label/normalized sont
 * composés automatiquement, pour rester dédoublonnables comme avant.
 */
export async function findOrCreateStructuredPlace(treeId, place) {
  if (isPlaceEmpty(place)) return null;
  const rawLabel = composePlaceLabel(place);
  if (!rawLabel) return null;
  const normalized = rawLabel.toLowerCase();

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
    .insert({
      tree_id: treeId,
      raw_label: rawLabel,
      normalized,
      street_number: place.streetNumber?.trim() || null,
      street_name: place.streetName?.trim() || null,
      building_name: place.buildingName?.trim() || null,
      arrondissement: place.arrondissement?.trim() || null,
      city: place.city?.trim() || null,
      postal_code: place.postalCode?.trim() || null,
      department: place.department?.trim() || null,
      region: place.region?.trim() || null,
      country: place.country?.trim() || null,
    })
    .select('id')
    .single();
  if (createErr) throw createErr;
  return created.id;
}

/**
 * Lieu structuré complet (les 9 champs) pour un id de lieu — sert à
 * pré-remplir StructuredPlaceInput quand on édite l'état civil d'une
 * fiche existante (CivilHeader) : la Map `places` fournie aux autres
 * composants (Timeline, etc.) ne porte que raw_label, qui suffit pour
 * l'affichage mais pas pour éditer le lieu champ par champ. Renvoie un
 * objet compatible EMPTY_PLACE (chaînes vides pour les champs non
 * renseignés — cas d'un lieu importé d'un GEDCOM ou créé via l'ancien
 * champ libre, qui n'a que raw_label), ou null si aucun lieu.
 */
export async function fetchStructuredPlace(placeId) {
  if (!placeId) return null;
  const { data, error } = await supabase
    .from('places')
    .select('street_number, street_name, building_name, arrondissement, city, postal_code, department, region, country')
    .eq('id', placeId)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return {
    streetNumber: data.street_number || '',
    streetName: data.street_name || '',
    buildingName: data.building_name || '',
    arrondissement: data.arrondissement || '',
    city: data.city || '',
    postalCode: data.postal_code || '',
    department: data.department || '',
    region: data.region || '',
    country: data.country || '',
  };
}

/** Met à jour l'état civil (en-tête de la fiche). places : { birth, death } — objets lieu structurés (voir StructuredPlaceInput.jsx), absent pour ne pas toucher au lieu actuel. */
export async function updateIndividualCivilInfo(individualId, treeId, patch, places = {}) {
  const birthPlaceId = places.birth !== undefined ? await findOrCreateStructuredPlace(treeId, places.birth) : undefined;
  const deathPlaceId = places.death !== undefined ? await findOrCreateStructuredPlace(treeId, places.death) : undefined;

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

/**
 * Crée un individu "vierge" — seul moyen d'ajouter une personne à
 * l'arbre en dehors d'un import GEDCOM (depuis la liste des fiches, ou
 * à la volée quand on cherche un parent/conjoint/enfant qui n'existe
 * pas encore, voir IndividualPicker). Les autres informations
 * (naissance, décès, liens...) se renseignent ensuite depuis la fiche,
 * exactement comme pour un individu importé.
 */
export async function createIndividual(treeId, { firstNames, lastName, sex } = {}) {
  const { data, error } = await supabase
    .from('individuals')
    .insert({
      tree_id: treeId,
      first_names: firstNames?.trim() || null,
      last_name: lastName?.trim() || null,
      sex: sex || 'U',
    })
    .select('id, first_names, last_name')
    .single();
  if (error) throw error;
  return data;
}

/**
 * Création complète d'un individu depuis le formulaire détaillé de
 * "Fiches individus" (prénoms, nom de naissance/marital, sexe, date et
 * lieu de naissance, vivant/décédé et date/lieu de décès). Contrairement
 * à createIndividual (fiche vierge, utilisée par IndividualPicker), ici
 * tout ce qui est fourni est enregistré directement — la fiche détaillée
 * reste le seul endroit pour corriger ensuite.
 *
 * Nom de naissance / nom marital : le schéma a déjà les deux colonnes
 * qu'il faut (birth_name / last_name, voir schema.sql) — birth_name
 * reçoit toujours le nom de naissance, last_name (le nom "d'usage" lu
 * partout dans l'UI) reçoit le nom marital s'il est fourni (uniquement
 * pertinent pour une femme), sinon retombe sur le nom de naissance.
 *
 * `input` : { firstNames, birthName, maritalLastName, sex, birthDate
 * (ISO ou null), birthPlace (objet structuré ou null), isDeceased,
 * deathDate, deathPlace }. La casse des champs texte est renormalisée
 * ici par sécurité (le formulaire l'applique déjà au blur).
 */
export async function createIndividualFull(treeId, input = {}) {
  const birthName = toProperCase(input.birthName?.trim() || '') || null;
  const maritalLastName = input.sex === 'F' ? toProperCase(input.maritalLastName?.trim() || '') || null : null;
  const lastName = maritalLastName || birthName;

  const [birthPlaceId, deathPlaceId] = await Promise.all([
    findOrCreateStructuredPlace(treeId, input.birthPlace),
    input.isDeceased ? findOrCreateStructuredPlace(treeId, input.deathPlace) : Promise.resolve(null),
  ]);

  const { data, error } = await supabase
    .from('individuals')
    .insert({
      tree_id: treeId,
      first_names: toProperCase(input.firstNames?.trim() || '') || null,
      birth_name: birthName,
      last_name: lastName,
      sex: input.sex || 'U',
      birth_date: input.birthDate || null,
      birth_date_precision: input.birthDate ? input.birthDatePrecision || 'exact' : 'unknown',
      birth_place_id: birthPlaceId,
      is_deceased: !!input.isDeceased,
      death_date: input.isDeceased ? input.deathDate || null : null,
      death_date_precision: input.isDeceased && input.deathDate ? input.deathDatePrecision || 'exact' : 'unknown',
      death_place_id: input.isDeceased ? deathPlaceId : null,
    })
    .select('id, first_names, last_name')
    .single();
  if (error) throw error;
  return { ...data, birthPlaceId, deathPlaceId: input.isDeceased ? deathPlaceId : null };
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

/** Parents déjà enregistrés d'un individu — { parentId, unionId } pour chacun. */
export async function fetchParentsOf(individualId) {
  const { data, error } = await supabase
    .from('filiations')
    .select('parent_id, union_id')
    .eq('child_id', individualId);
  if (error) throw error;
  return (data || []).map((r) => ({ parentId: r.parent_id, unionId: r.union_id }));
}

/**
 * Relie newIndividualId comme frère/sœur de existingIndividualId : lui
 * attribue les mêmes parents (et, quand elle est connue, la même union),
 * puisqu'un lien "frère/sœur" direct n'existe pas dans le schéma — c'est
 * le partage des mêmes parents qui le représente. Renvoie le nombre de
 * parents repris (0, 1 ou 2).
 */
export async function linkAsSibling(treeId, newIndividualId, existingIndividualId) {
  const parents = await fetchParentsOf(existingIndividualId);
  for (const { parentId, unionId } of parents) {
    const { error } = await supabase
      .from('filiations')
      .upsert(
        { tree_id: treeId, child_id: newIndividualId, parent_id: parentId, filiation_type: 'biological', union_id: unionId },
        { onConflict: 'child_id,parent_id' }
      );
    if (error) throw error;
  }
  return parents.length;
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
  // events.subject_id est polymorphe (individu OU union, voir schema.sql) :
  // pas de vraie contrainte FK possible, donc pas de ON DELETE CASCADE côté
  // base pour les événements de cette union (mise en couple/mariage/
  // divorce) — on les supprime explicitement avant l'union elle-même, sans
  // quoi ils resteraient orphelins (leurs citations, elles, suivent via
  // citations.event_id → events.id on delete cascade).
  const { error: eventsErr } = await supabase.from('events').delete().eq('subject_kind', 'union').eq('subject_id', unionId);
  if (eventsErr) throw eventsErr;

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
