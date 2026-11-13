/**
 * Écrit en base (Supabase) le résultat d'un import GEDCOM après la revue
 * de fusion/dédoublonnage. C'est le dernier maillon du pipeline :
 *   fichier .ged -> parser.js -> mapper.js -> dedupe/* (revue utilisateur)
 *   -> commitImport.js (ce fichier)
 *
 * Entrée attendue (voir features/import-export/MergeReview.jsx) :
 * {
 *   treeId, importBatchId,
 *   places:   [{ localId, rawLabel }],
 *   sources:  [{ localId, title, repository, notes }],
 *   individuals: [{ localId, existingId|null, firstNames, lastName, birthName,
 *                    sex, birthDate, birthDatePrecision, birthPlaceLocalId,
 *                    deathDate, deathDatePrecision, deathPlaceLocalId,
 *                    isDeceased, occupation, biography, gedcomXref }],
 *   families: [{ localId, husbandLocalId, wifeLocalId, childrenLocalIds,
 *                 unionType, status, startDate, startDatePrecision,
 *                 placeLocalId, endDate, endDatePrecision, gedcomXref }],
 *   filiations: [{ childLocalId, parentLocalId, unionLocalId, filiationType }],
 * }
 */
import { supabase } from '../supabaseClient.js';

async function insertPlaces(places, treeId) {
  const map = new Map();
  if (!places.length) return map;

  const rows = places.map((p) => ({
    tree_id: treeId,
    raw_label: p.rawLabel,
    normalized: p.rawLabel?.trim().toLowerCase() ?? null,
  }));
  const { data, error } = await supabase.from('places').insert(rows).select('id');
  if (error) throw error;
  data.forEach((row, i) => map.set(places[i].localId, row.id));
  return map;
}

async function insertSources(sources, treeId) {
  const map = new Map();
  if (!sources.length) return map;

  const rows = sources.map((s) => ({
    tree_id: treeId,
    title: s.title,
    repository: s.repository ?? null,
    notes: s.notes ?? null,
  }));
  const { data, error } = await supabase.from('sources').insert(rows).select('id');
  if (error) throw error;
  data.forEach((row, i) => map.set(sources[i].localId, row.id));
  return map;
}

async function upsertIndividuals(individuals, treeId, importBatchId, placeIdMap) {
  const map = new Map();
  const toInsert = individuals.filter((i) => !i.existingId);
  const toUpdate = individuals.filter((i) => i.existingId);

  const shapeRow = (ind) => ({
    tree_id: treeId,
    first_names: ind.firstNames ?? null,
    last_name: ind.lastName ?? null,
    birth_name: ind.birthName ?? null,
    sex: ind.sex ?? 'U',
    birth_date: ind.birthDate ?? null,
    birth_date_precision: ind.birthDatePrecision ?? 'unknown',
    birth_place_id: ind.birthPlaceLocalId ? placeIdMap.get(ind.birthPlaceLocalId) ?? null : null,
    death_date: ind.deathDate ?? null,
    death_date_precision: ind.deathDatePrecision ?? 'unknown',
    death_place_id: ind.deathPlaceLocalId ? placeIdMap.get(ind.deathPlaceLocalId) ?? null : null,
    is_deceased: !!ind.isDeceased,
    occupation: ind.occupation ?? null,
    biography: ind.biography ?? null,
    gedcom_xref: ind.gedcomXref ?? null,
    import_batch_id: importBatchId,
  });

  if (toInsert.length) {
    const { data, error } = await supabase
      .from('individuals')
      .insert(toInsert.map(shapeRow))
      .select('id');
    if (error) throw error;
    data.forEach((row, i) => map.set(toInsert[i].localId, row.id));
  }

  for (const ind of toUpdate) {
    const { error } = await supabase
      .from('individuals')
      .update(shapeRow(ind))
      .eq('id', ind.existingId);
    if (error) throw error;
    map.set(ind.localId, ind.existingId);
  }

  return map;
}

async function insertUnions(families, treeId, placeIdMap) {
  const map = new Map();
  if (!families.length) return map;

  const rows = families.map((f) => ({
    tree_id: treeId,
    union_type: f.unionType ?? 'unknown',
    status: f.status ?? 'unknown',
    start_date: f.startDate ?? null,
    start_date_precision: f.startDatePrecision ?? 'unknown',
    end_date: f.endDate ?? null,
    end_date_precision: f.endDatePrecision ?? 'unknown',
    place_id: f.placeLocalId ? placeIdMap.get(f.placeLocalId) ?? null : null,
    gedcom_xref: f.gedcomXref ?? null,
  }));
  const { data, error } = await supabase.from('unions').insert(rows).select('id');
  if (error) throw error;
  data.forEach((row, i) => map.set(families[i].localId, row.id));
  return map;
}

async function insertUnionPartners(families, unionIdMap, individualIdMap) {
  const rows = [];
  for (const f of families) {
    const unionId = unionIdMap.get(f.localId);
    if (f.husbandLocalId && individualIdMap.has(f.husbandLocalId)) {
      rows.push({ union_id: unionId, individual_id: individualIdMap.get(f.husbandLocalId) });
    }
    if (f.wifeLocalId && individualIdMap.has(f.wifeLocalId)) {
      rows.push({ union_id: unionId, individual_id: individualIdMap.get(f.wifeLocalId) });
    }
  }
  if (!rows.length) return;
  const { error } = await supabase.from('union_partners').insert(rows);
  if (error) throw error;
}

async function insertFiliations(filiations, treeId, unionIdMap, individualIdMap) {
  const rows = filiations
    .filter((f) => individualIdMap.has(f.childLocalId) && individualIdMap.has(f.parentLocalId))
    .map((f) => ({
      tree_id: treeId,
      child_id: individualIdMap.get(f.childLocalId),
      parent_id: individualIdMap.get(f.parentLocalId),
      union_id: f.unionLocalId ? unionIdMap.get(f.unionLocalId) ?? null : null,
      filiation_type: f.filiationType ?? 'biological',
    }));
  if (!rows.length) return;
  // upsert pour tolérer une ré-importation du même fichier (contrainte unique child_id+parent_id)
  const { error } = await supabase.from('filiations').upsert(rows, { onConflict: 'child_id,parent_id' });
  if (error) throw error;
}

/** Génère les événements (naissance, décès, mariage, divorce) déduits des dates saisies. */
async function insertDerivedEvents(individuals, families, treeId, individualIdMap, unionIdMap, placeIdMap) {
  const rows = [];

  for (const ind of individuals) {
    const subjectId = individualIdMap.get(ind.localId);
    if (!subjectId) continue;
    if (ind.birthDate || ind.birthPlaceLocalId) {
      rows.push({
        tree_id: treeId, subject_kind: 'individual', subject_id: subjectId,
        event_type: 'birth', event_date: ind.birthDate ?? null,
        date_precision: ind.birthDatePrecision ?? 'unknown',
        place_id: ind.birthPlaceLocalId ? placeIdMap.get(ind.birthPlaceLocalId) ?? null : null,
      });
    }
    if (ind.isDeceased) {
      rows.push({
        tree_id: treeId, subject_kind: 'individual', subject_id: subjectId,
        event_type: 'death', event_date: ind.deathDate ?? null,
        date_precision: ind.deathDatePrecision ?? 'unknown',
        place_id: ind.deathPlaceLocalId ? placeIdMap.get(ind.deathPlaceLocalId) ?? null : null,
      });
    }
  }

  for (const fam of families) {
    const subjectId = unionIdMap.get(fam.localId);
    if (!subjectId) continue;
    if (fam.unionType === 'marriage' || fam.startDate) {
      rows.push({
        tree_id: treeId, subject_kind: 'union', subject_id: subjectId,
        event_type: 'marriage', event_date: fam.startDate ?? null,
        date_precision: fam.startDatePrecision ?? 'unknown',
        place_id: fam.placeLocalId ? placeIdMap.get(fam.placeLocalId) ?? null : null,
      });
    }
    if (fam.status === 'divorced' && fam.endDate) {
      rows.push({
        tree_id: treeId, subject_kind: 'union', subject_id: subjectId,
        event_type: 'divorce', event_date: fam.endDate, date_precision: fam.endDatePrecision ?? 'unknown',
      });
    }
  }

  if (!rows.length) return;
  const { error } = await supabase.from('events').insert(rows);
  if (error) throw error;
}

/**
 * Point d'entrée : exécute l'écriture complète dans l'ordre imposé par
 * les clés étrangères (lieux/sources -> individus -> unions -> liens).
 * Retourne un résumé pour l'écran de fin d'import.
 */
export async function commitImport(model) {
  const { treeId, importBatchId, places, sources, individuals, families, filiations } = model;

  const placeIdMap = await insertPlaces(places, treeId);
  await insertSources(sources, treeId); // (branché aux citations dans une phase ultérieure)
  const individualIdMap = await upsertIndividuals(individuals, treeId, importBatchId, placeIdMap);
  const unionIdMap = await insertUnions(families, treeId, placeIdMap);
  await insertUnionPartners(families, unionIdMap, individualIdMap);
  await insertFiliations(filiations, treeId, unionIdMap, individualIdMap);
  await insertDerivedEvents(individuals, families, treeId, individualIdMap, unionIdMap, placeIdMap);

  return {
    individualsWritten: individualIdMap.size,
    unionsWritten: unionIdMap.size,
    placesWritten: placeIdMap.size,
  };
}
