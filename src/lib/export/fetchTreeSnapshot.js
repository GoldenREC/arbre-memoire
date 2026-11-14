import { supabase } from '../supabaseClient.js';

/**
 * Charge un instantané complet d'un arbre, prêt à être consommé par les
 * trois exporteurs (GEDCOM, JSON, PDF). Toutes les tables sont lues en
 * requêtes séparées puis jointes à la main en JS (convention du projet —
 * voir useFamilyGraph.js, useIndividualDetail.js — pour éviter toute
 * ambiguïté de FK dans les "select" imbriqués de PostgREST).
 */
export async function fetchTreeSnapshot(treeId) {
  const [
    { data: treeRow, error: e0 },
    { data: individualRows, error: e1 },
    { data: unionRows, error: e2 },
    { data: partnerRows, error: e3 },
    { data: filiationRows, error: e4 },
    { data: placeRows, error: e5 },
    { data: eventRows, error: e6 },
    { data: sourceRows, error: e7 },
    { data: citationRows, error: e8 },
    { data: mediaRows, error: e9 },
    { data: petRows, error: e10 },
    { data: petLinkRows, error: e11 },
    { data: mediaLinkRows, error: e12 },
    { data: faceTagRows, error: e13 },
  ] = await Promise.all([
    supabase.from('trees').select('privacy_threshold_years').eq('id', treeId).maybeSingle(),
    supabase.from('individuals').select('*').eq('tree_id', treeId),
    supabase.from('unions').select('*').eq('tree_id', treeId),
    supabase.from('union_partners').select('union_id, individual_id, role_label, unions!inner(tree_id)').eq('unions.tree_id', treeId),
    supabase.from('filiations').select('*').eq('tree_id', treeId),
    supabase.from('places').select('*').eq('tree_id', treeId),
    supabase.from('events').select('*').eq('tree_id', treeId),
    supabase.from('sources').select('*').eq('tree_id', treeId),
    supabase.from('citations').select('*').eq('tree_id', treeId),
    supabase.from('media').select('*').eq('tree_id', treeId),
    supabase.from('pets').select('*').eq('tree_id', treeId),
    supabase.from('pet_links').select('pet_id, subject_kind, subject_id, relationship, pets!inner(tree_id)').eq('pets.tree_id', treeId),
    supabase.from('media_links').select('media_id, subject_kind, subject_id, media!inner(tree_id)').eq('media.tree_id', treeId),
    supabase.from('media_face_tags').select('id, media_id, individual_id, x, y, width, height, media!inner(tree_id)').eq('media.tree_id', treeId),
  ]);

  const firstError = e0 || e1 || e2 || e3 || e4 || e5 || e6 || e7 || e8 || e9 || e10 || e11 || e12 || e13;
  if (firstError) throw firstError;

  const privacyThresholdYears = treeRow?.privacy_threshold_years ?? 100;

  const placesById = new Map((placeRows || []).map((p) => [p.id, p]));

  const partnersByUnion = new Map();
  for (const row of partnerRows || []) {
    if (!partnersByUnion.has(row.union_id)) partnersByUnion.set(row.union_id, []);
    partnersByUnion.get(row.union_id).push({ individualId: row.individual_id, roleLabel: row.role_label });
  }

  const unions = (unionRows || []).map((u) => ({
    id: u.id,
    unionType: u.union_type,
    status: u.status,
    startDate: u.start_date,
    startDatePrecision: u.start_date_precision,
    endDate: u.end_date,
    endDatePrecision: u.end_date_precision,
    placeId: u.place_id,
    notes: u.notes,
    gedcomXref: u.gedcom_xref,
    partners: partnersByUnion.get(u.id) || [],
  }));

  const individuals = (individualRows || []).map((i) => ({
    id: i.id,
    firstNames: i.first_names,
    lastName: i.last_name,
    birthName: i.birth_name,
    nickname: i.nickname,
    sex: i.sex,
    birthDate: i.birth_date,
    birthDatePrecision: i.birth_date_precision,
    birthPlaceId: i.birth_place_id,
    deathDate: i.death_date,
    deathDatePrecision: i.death_date_precision,
    deathPlaceId: i.death_place_id,
    isDeceased: i.is_deceased,
    occupation: i.occupation,
    biography: i.biography,
    gedcomXref: i.gedcom_xref,
  }));

  const filiations = (filiationRows || []).map((f) => ({
    id: f.id,
    childId: f.child_id,
    parentId: f.parent_id,
    unionId: f.union_id,
    filiationType: f.filiation_type,
    notes: f.notes,
  }));

  const events = (eventRows || []).map((e) => ({
    id: e.id,
    subjectKind: e.subject_kind,
    subjectId: e.subject_id,
    eventType: e.event_type,
    label: e.label,
    eventDate: e.event_date,
    datePrecision: e.date_precision,
    placeId: e.place_id,
    description: e.description,
    proofLevel: e.proof_level,
  }));

  const sources = (sourceRows || []).map((s) => ({
    id: s.id,
    title: s.title,
    sourceType: s.source_type,
    repository: s.repository,
    callNumber: s.call_number,
    url: s.url,
    notes: s.notes,
  }));

  const citations = (citationRows || []).map((c) => ({
    id: c.id,
    sourceId: c.source_id,
    eventId: c.event_id,
    individualId: c.individual_id,
    transcription: c.transcription,
    pageRef: c.page_ref,
  }));

  const media = (mediaRows || []).map((m) => ({
    id: m.id,
    mediaType: m.media_type,
    storagePath: m.storage_path,
    title: m.title,
    description: m.description,
    takenAt: m.taken_at,
    sourceId: m.source_id,
  }));

  const pets = (petRows || []).map((p) => ({
    id: p.id,
    name: p.name,
    species: p.species,
    breed: p.breed,
    sex: p.sex,
    birthDate: p.birth_date,
    deathDate: p.death_date,
    anecdotes: p.anecdotes,
  }));

  const petLinks = (petLinkRows || []).map((l) => ({
    petId: l.pet_id,
    subjectKind: l.subject_kind,
    subjectId: l.subject_id,
    relationship: l.relationship,
  }));

  const mediaLinks = (mediaLinkRows || []).map((l) => ({
    mediaId: l.media_id,
    subjectKind: l.subject_kind,
    subjectId: l.subject_id,
  }));

  const mediaFaceTags = (faceTagRows || []).map((t) => ({
    id: t.id,
    mediaId: t.media_id,
    individualId: t.individual_id,
    x: t.x,
    y: t.y,
    width: t.width,
    height: t.height,
  }));

  return {
    treeId,
    privacyThresholdYears,
    individuals,
    unions,
    filiations,
    places: placeRows || [],
    placesById,
    events,
    sources,
    citations,
    media,
    pets,
    petLinks,
    mediaLinks,
    mediaFaceTags,
  };
}

/** Libellé d'un lieu à partir de son id (ou null si non renseigné). */
export function placeLabel(snapshot, placeId) {
  if (!placeId) return null;
  return snapshot.placesById.get(placeId)?.raw_label || null;
}
