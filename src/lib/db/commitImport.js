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
import { composePlaceLabel, isPlaceEmpty } from '../utils/placeLabel.js';

/**
 * Un lieu de staging est soit { localId, rawLabel } (GEDCOM — chaîne
 * libre, comportement historique inchangé), soit { localId, structured }
 * où `structured` est un objet aux 9 champs (voir StructuredPlaceInput) —
 * utilisé par l'import personnalisé (docs/IMPORT_FORMAT.md). Dans ce
 * second cas, raw_label/normalized sont composés automatiquement, comme
 * le fait findOrCreateStructuredPlace côté saisie manuelle.
 */
async function insertPlaces(places, treeId) {
  const map = new Map();
  if (!places.length) return map;

  const rows = places.map((p) => {
    if (p.structured && !isPlaceEmpty(p.structured)) {
      const rawLabel = composePlaceLabel(p.structured);
      return {
        tree_id: treeId,
        raw_label: rawLabel,
        normalized: rawLabel.toLowerCase(),
        street_number: p.structured.streetNumber?.trim() || null,
        street_name: p.structured.streetName?.trim() || null,
        building_name: p.structured.buildingName?.trim() || null,
        arrondissement: p.structured.arrondissement?.trim() || null,
        city: p.structured.city?.trim() || null,
        postal_code: p.structured.postalCode?.trim() || null,
        department: p.structured.department?.trim() || null,
        region: p.structured.region?.trim() || null,
        country: p.structured.country?.trim() || null,
      };
    }
    return {
      tree_id: treeId,
      raw_label: p.rawLabel,
      normalized: p.rawLabel?.trim().toLowerCase() ?? null,
    };
  });
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
    // Surnom : seulement s'il est fourni, pour ne jamais effacer celui
    // d'une fiche existante lors d'une mise à jour qui n'en parle pas.
    ...(ind.nickname ? { nickname: ind.nickname } : {}),
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

/**
 * Les localId des partenaires d'une union de staging : soit directement
 * `f.partnerLocalIds` (import personnalisé — liste libre, sans notion de
 * mari/femme), soit `[husbandLocalId, wifeLocalId]` (GEDCOM — comportement
 * historique inchangé).
 */
function partnerLocalIdsOf(f) {
  if (f.partnerLocalIds) return f.partnerLocalIds.filter(Boolean);
  return [f.husbandLocalId, f.wifeLocalId].filter(Boolean);
}

/**
 * Clé de déduplication d'une union : la liste triée des ids réels (déjà
 * résolus via individualIdMap) de ses partenaires. Deux familles qui
 * partagent exactement les mêmes partenaires sont la même union, même si
 * elles viennent de deux enregistrements FAM distincts (cas fréquent des
 * GEDCOM de corrélation multi-sources, qui dupliquent un même mariage).
 * Retourne null quand aucun partenaire n'est résolu (rien à dédupliquer).
 */
export function partnersKey(f, individualIdMap) {
  const ids = partnerLocalIdsOf(f)
    .filter((localId) => individualIdMap.has(localId))
    .map((localId) => individualIdMap.get(localId));
  if (!ids.length) return null;
  return ids.slice().sort().join(',');
}

/**
 * Unions déjà en base pour cet arbre : une map clé-de-partenaires -> union id,
 * et l'ensemble des paires (union_id, individual_id) déjà présentes dans
 * union_partners (pour ne jamais retenter d'insérer une paire existante —
 * la table a une clé primaire composite sur ces deux colonnes).
 */
async function fetchExistingUnionPartners(treeId) {
  const { data, error } = await supabase
    .from('union_partners')
    .select('union_id, individual_id, unions!inner(tree_id)')
    .eq('unions.tree_id', treeId);
  if (error) throw error;

  const partnersByUnion = new Map();
  const existingPairs = new Set();
  for (const row of data || []) {
    if (!partnersByUnion.has(row.union_id)) partnersByUnion.set(row.union_id, []);
    partnersByUnion.get(row.union_id).push(row.individual_id);
    existingPairs.add(`${row.union_id}:${row.individual_id}`);
  }
  const keyToUnionId = new Map();
  for (const [unionId, partnerIds] of partnersByUnion) {
    const key = partnerIds.slice().sort().join(',');
    if (key) keyToUnionId.set(key, unionId);
  }
  return { keyToUnionId, existingPairs };
}

async function insertUnions(families, treeId, placeIdMap, individualIdMap) {
  const map = new Map();
  if (!families.length) return { map, existingPairs: new Set() };

  // Dédoublonnage : une union avec les mêmes partenaires déjà présente
  // dans l'arbre (import précédent) ou répétée plusieurs fois dans CE
  // même import (fragments FAM dupliqués) n'est jamais réinsérée.
  const { keyToUnionId: existingByKey, existingPairs } = await fetchExistingUnionPartners(treeId);
  const batchPrimaryByKey = new Map(); // clé -> localId de la famille "maîtresse" de ce batch
  const duplicateOf = new Map(); // localId du doublon -> localId de la famille maîtresse

  const toInsert = [];
  const toInsertFamilies = [];

  for (const f of families) {
    const key = partnersKey(f, individualIdMap);
    if (key && existingByKey.has(key)) {
      map.set(f.localId, existingByKey.get(key));
      continue;
    }
    if (key && batchPrimaryByKey.has(key)) {
      duplicateOf.set(f.localId, batchPrimaryByKey.get(key));
      continue;
    }
    if (key) batchPrimaryByKey.set(key, f.localId);
    toInsertFamilies.push(f);
    toInsert.push({
      tree_id: treeId,
      union_type: f.unionType ?? 'unknown',
      status: f.status ?? 'unknown',
      start_date: f.startDate ?? null,
      start_date_precision: f.startDatePrecision ?? 'unknown',
      end_date: f.endDate ?? null,
      end_date_precision: f.endDatePrecision ?? 'unknown',
      place_id: f.placeLocalId ? placeIdMap.get(f.placeLocalId) ?? null : null,
      gedcom_xref: f.gedcomXref ?? null,
    });
  }

  if (toInsert.length) {
    const { data, error } = await supabase.from('unions').insert(toInsert).select('id');
    if (error) throw error;
    data.forEach((row, i) => map.set(toInsertFamilies[i].localId, row.id));
  }

  for (const [dupLocalId, primaryLocalId] of duplicateOf) {
    map.set(dupLocalId, map.get(primaryLocalId));
  }

  return { map, existingPairs };
}

async function insertUnionPartners(families, unionIdMap, individualIdMap, existingPairs) {
  const rows = [];
  const seen = new Set(existingPairs); // "unionId:individualId" déjà présents en base,
                                        // ou déjà ajoutés ici — jamais réinsérés (clé primaire composite).
  for (const f of families) {
    const unionId = unionIdMap.get(f.localId);
    for (const localId of partnerLocalIdsOf(f)) {
      if (!individualIdMap.has(localId)) continue;
      const individualId = individualIdMap.get(localId);
      const key = `${unionId}:${individualId}`;
      if (seen.has(key)) continue;
      seen.add(key);
      rows.push({ union_id: unionId, individual_id: individualId });
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
    if (fam.splitMarriageMilestone) {
      // Mise en couple et mariage sont deux jalons indépendants (voir
      // unionMutations.js) : la mise en couple vient toujours de
      // startDate/place, le mariage de ses propres champs dédiés
      // (fam.marriageDate/marriagePlaceLocalId — voir mapper.js).
      if (fam.startDate || fam.placeLocalId) {
        rows.push({
          tree_id: treeId, subject_kind: 'union', subject_id: subjectId,
          event_type: 'union_start', event_date: fam.startDate ?? null,
          date_precision: fam.startDatePrecision ?? 'unknown',
          place_id: fam.placeLocalId ? placeIdMap.get(fam.placeLocalId) ?? null : null,
        });
      }
      if (fam.marriageDate || fam.marriagePlaceLocalId) {
        rows.push({
          tree_id: treeId, subject_kind: 'union', subject_id: subjectId,
          event_type: 'marriage', event_date: fam.marriageDate ?? null,
          date_precision: fam.marriageDatePrecision ?? 'unknown',
          place_id: fam.marriagePlaceLocalId ? placeIdMap.get(fam.marriagePlaceLocalId) ?? null : null,
        });
      }
    } else if (fam.startDate || fam.placeLocalId) {
      // Comportement historique (fichiers sans "marriage" dédié) : une
      // union n'est pas forcément un mariage (en couple/concubinage...) —
      // on ne crée un événement "marriage" que si le type résolu l'est
      // vraiment (voir mapper.js:resolveUnionType) ; sinon, la même date
      // décrit une "mise en couple" (événement distinct, event_type_enum).
      rows.push({
        tree_id: treeId, subject_kind: 'union', subject_id: subjectId,
        event_type: fam.unionType === 'marriage' ? 'marriage' : 'union_start',
        event_date: fam.startDate ?? null,
        date_precision: fam.startDatePrecision ?? 'unknown',
        place_id: fam.placeLocalId ? placeIdMap.get(fam.placeLocalId) ?? null : null,
      });
    }
    if (fam.status === 'divorced' && fam.endDate) {
      rows.push({
        tree_id: treeId, subject_kind: 'union', subject_id: subjectId,
        event_type: 'divorce', event_date: fam.endDate, date_precision: fam.endDatePrecision ?? 'unknown',
        place_id: fam.divorcePlaceLocalId ? placeIdMap.get(fam.divorcePlaceLocalId) ?? null : null,
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
  const { map: unionIdMap, existingPairs } = await insertUnions(families, treeId, placeIdMap, individualIdMap);
  await insertUnionPartners(families, unionIdMap, individualIdMap, existingPairs);
  await insertFiliations(filiations, treeId, unionIdMap, individualIdMap);
  await insertDerivedEvents(individuals, families, treeId, individualIdMap, unionIdMap, placeIdMap);

  return {
    individualsWritten: individualIdMap.size,
    unionsWritten: unionIdMap.size,
    placesWritten: placeIdMap.size,
    // Cartes localId -> UUID réel, exposées pour une étape ultérieure
    // propre à l'appelant (ex. attacher des preuves/médias à des
    // individus ou unions fraîchement créés — voir customImport/).
    individualIdMap,
    unionIdMap,
    placeIdMap,
  };
}
