/**
 * Fusion de deux fiches individu déjà en base, depuis Audit →
 * "Doublon potentiel" → "Fusionner" (typiquement après un GEDCOM
 * importé deux fois dans le même arbre). Charge l'état civil complet
 * des deux fiches (le bundle Audit ne porte que les champs utiles aux
 * calculs, voir statsData.js), expose la fusion de champs pure
 * (mergeLiveIndividuals, lib/dedupe/merge.js) et écrit le résultat :
 * mise à jour de la fiche conservée, puis RPC merge_individuals qui
 * réaffecte toutes les relations et supprime le doublon (voir
 * supabase/merge.sql — opération tout-ou-rien côté base).
 */
import { supabase } from '../../lib/supabaseClient.js';
import { mergeLiveIndividuals, applyConflictResolutions } from '../../lib/dedupe/merge.js';

/** Charge l'état civil complet d'un individu (champs non inclus dans le bundle Audit). */
export async function fetchIndividualForMerge(individualId) {
  const { data, error } = await supabase
    .from('individuals')
    .select('id, first_names, last_name, birth_name, sex, birth_date, birth_date_precision, birth_place_id, death_date, death_date_precision, death_place_id, is_deceased, occupation, biography')
    .eq('id', individualId)
    .single();
  if (error) throw error;
  return {
    id: data.id,
    firstNames: data.first_names,
    lastName: data.last_name,
    birthName: data.birth_name,
    sex: data.sex,
    birthDate: data.birth_date,
    birthDatePrecision: data.birth_date_precision,
    birthPlaceId: data.birth_place_id,
    deathDate: data.death_date,
    deathDatePrecision: data.death_date_precision,
    deathPlaceId: data.death_place_id,
    isDeceased: data.is_deceased,
    occupation: data.occupation,
    biography: data.biography,
  };
}

export { mergeLiveIndividuals };

/**
 * Écrit la fusion : patch de la fiche conservée avec les champs
 * résolus, puis RPC merge_individuals pour réaffecter toutes les
 * relations (filiations, unions, médias, animaux, branches suivies,
 * événements, citations, notifications, De Cujus) et supprimer la
 * fiche doublon. keepId/removeId doivent correspondre à kept/removed
 * tels que passés à mergeLiveIndividuals().
 */
export async function commitMerge({ treeId, keepId, removeId, mergeResult, resolutions }) {
  const resolved = applyConflictResolutions(mergeResult, resolutions);

  const { error: updateErr } = await supabase
    .from('individuals')
    .update({
      first_names: resolved.firstNames ?? null,
      last_name: resolved.lastName ?? null,
      birth_name: resolved.birthName ?? null,
      sex: resolved.sex ?? 'U',
      birth_date: resolved.birthDate ?? null,
      birth_date_precision: resolved.birthDatePrecision ?? 'unknown',
      birth_place_id: resolved.birthPlaceId ?? null,
      death_date: resolved.deathDate ?? null,
      death_date_precision: resolved.deathDatePrecision ?? 'unknown',
      death_place_id: resolved.deathPlaceId ?? null,
      is_deceased: !!resolved.isDeceased,
      occupation: resolved.occupation ?? null,
      biography: resolved.biography ?? null,
    })
    .eq('id', keepId);
  if (updateErr) throw updateErr;

  const { error: rpcErr } = await supabase.rpc('merge_individuals', {
    p_tree_id: treeId,
    p_keep_id: keepId,
    p_remove_id: removeId,
  });
  if (rpcErr) throw rpcErr;
}
