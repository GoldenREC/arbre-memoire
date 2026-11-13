/**
 * Chargement en bloc de tout ce dont les modules Statistiques et Audit
 * ont besoin — un petit nombre de requêtes larges plutôt qu'une
 * requête par individu (cohérent avec la taille attendue d'un arbre
 * familial, de l'ordre de quelques centaines à quelques milliers de
 * fiches) ; tous les calculs eux-mêmes (statsEngine.js, auditEngine.js)
 * restent des fonctions pures qui opèrent sur ces données déjà
 * chargées, donc testables sans Supabase.
 */
import { supabase } from '../../lib/supabaseClient.js';
import { computeNmdStatus } from '../individual/nmdStatus.js';

export async function loadStatsBundle(treeId) {
  const [
    { data: individualRows, error: indErr },
    { data: filiationRows, error: filErr },
    { data: unionRows, error: unErr },
    { data: partnerRows, error: partErr },
    { data: eventRows, error: evErr },
    { data: citationRows, error: citErr },
    { data: mediaRows, error: medErr },
    { data: placeRows, error: plErr },
    { data: faceTagRows, error: tagErr },
    { data: mediaLinkRows, error: linkErr },
  ] = await Promise.all([
    supabase.from('individuals').select('id, first_names, last_name, sex, birth_date, birth_date_precision, death_date, death_date_precision, birth_place_id, death_place_id, is_deceased'),
    supabase.from('filiations').select('id, child_id, parent_id, filiation_type'),
    supabase.from('unions').select('id, union_type, status, start_date, start_date_precision, place_id'),
    supabase.from('union_partners').select('union_id, individual_id'),
    supabase.from('events').select('id, subject_kind, subject_id, event_type, event_date, proof_level, place_id'),
    supabase.from('citations').select('id, source_id, event_id'),
    supabase.from('media').select('id, source_id, media_type'),
    supabase.from('places').select('id, raw_label'),
    supabase.from('media_face_tags').select('media_id, individual_id'),
    supabase.from('media_links').select('media_id, subject_kind, subject_id'),
  ]);

  for (const [label, error] of [
    ['individuals', indErr], ['filiations', filErr], ['unions', unErr], ['union_partners', partErr],
    ['events', evErr], ['citations', citErr], ['media', medErr], ['places', plErr],
    ['media_face_tags', tagErr], ['media_links', linkErr],
  ]) {
    if (error) throw new Error(`${label}: ${error.message}`);
  }

  // Tree scoping: toutes ces tables sont déjà filtrées par RLS à l'arbre
  // courant côté Supabase (is_tree_member(tree_id)) — rien à filtrer ici.
  void treeId;

  const individuals = (individualRows || []).map((r) => ({
    id: r.id,
    firstNames: r.first_names,
    lastName: r.last_name,
    sex: r.sex,
    birthDate: r.birth_date,
    birthDatePrecision: r.birth_date_precision,
    deathDate: r.death_date,
    deathDatePrecision: r.death_date_precision,
    birthPlaceId: r.birth_place_id,
    deathPlaceId: r.death_place_id,
    isDeceased: r.is_deceased,
  }));

  const filiations = (filiationRows || []).map((f) => ({ id: f.id, childId: f.child_id, parentId: f.parent_id, filiationType: f.filiation_type }));

  const unions = (unionRows || []).map((u) => ({ id: u.id, unionType: u.union_type, status: u.status, startDate: u.start_date, startDatePrecision: u.start_date_precision, placeId: u.place_id }));

  const placesById = new Map((placeRows || []).map((p) => [p.id, p.raw_label]));

  const events = (eventRows || []).map((e) => ({
    id: e.id,
    subjectKind: e.subject_kind,
    subjectId: e.subject_id,
    eventType: e.event_type,
    date: e.event_date,
    proofLevel: e.proof_level,
    placeId: e.place_id,
  }));

  const mediaSourceIds = new Set((mediaRows || []).filter((m) => m.source_id).map((m) => m.source_id));
  const citations = (citationRows || []).map((c) => ({ id: c.id, sourceId: c.source_id, eventId: c.event_id, hasMedia: mediaSourceIds.has(c.source_id) }));

  const unionPartners = partnerRows || [];
  const partnersByUnion = new Map();
  const unionsByIndividual = new Map();
  for (const row of unionPartners) {
    if (!partnersByUnion.has(row.union_id)) partnersByUnion.set(row.union_id, []);
    partnersByUnion.get(row.union_id).push(row.individual_id);
    if (!unionsByIndividual.has(row.individual_id)) unionsByIndividual.set(row.individual_id, []);
    unionsByIndividual.get(row.individual_id).push(row.union_id);
  }

  // Individus ayant au moins une photo (identifiée par tag ou rattachement
  // direct) — utilisé pour le taux de complétude ("portrait").
  const individualsWithPhoto = new Set([
    ...(faceTagRows || []).map((t) => t.individual_id),
    ...(mediaLinkRows || []).filter((l) => l.subject_kind === 'individual').map((l) => l.subject_id),
  ]);

  return {
    individuals,
    filiations,
    unions,
    unionPartners,
    partnersByUnion,
    unionsByIndividual,
    events,
    citations,
    placesById,
    individualsWithPhoto,
  };
}

/**
 * Statut N/M/D (voir nmdStatus.js, même logique que les pastilles de la
 * fiche individu) pour tous les individus d'un coup, à partir du bundle
 * chargé par loadStatsBundle — réutilise le même calcul plutôt que de
 * le dupliquer, pour que la progression affichée dans Statistiques/
 * Audit corresponde exactement aux pastilles vues sur chaque fiche.
 */
export function bulkNmdStatus(bundle) {
  const birthByIndividual = new Map();
  const deathByIndividual = new Map();
  const marriageByUnion = new Map();
  for (const e of bundle.events) {
    if (e.subjectKind === 'individual' && e.eventType === 'birth') birthByIndividual.set(e.subjectId, e);
    if (e.subjectKind === 'individual' && e.eventType === 'death') deathByIndividual.set(e.subjectId, e);
    if (e.subjectKind === 'union' && e.eventType === 'marriage') marriageByUnion.set(e.subjectId, e);
  }

  const statusByIndividual = new Map();
  for (const ind of bundle.individuals) {
    const events = [];
    const birth = birthByIndividual.get(ind.id);
    if (birth) events.push({ id: birth.id, origin: 'individual', eventType: 'birth', proofLevel: birth.proofLevel });
    const death = deathByIndividual.get(ind.id);
    if (death) events.push({ id: death.id, origin: 'individual', eventType: 'death', proofLevel: death.proofLevel });

    const myUnionIds = bundle.unionsByIndividual.get(ind.id) || [];
    const unions = myUnionIds.map((uId) => {
      const m = marriageByUnion.get(uId);
      if (m) events.push({ id: m.id, origin: 'union', eventType: 'marriage', unionId: uId, proofLevel: m.proofLevel });
      return { id: uId };
    });

    statusByIndividual.set(ind.id, computeNmdStatus({ individual: ind, unions, events, citations: bundle.citations }));
  }
  return statusByIndividual;
}
