/**
 * Moteur de fusion : combine un individu "existant" (déjà dans l'arbre)
 * et un individu "entrant" (venant d'un import GEDCOM) sans perte de
 * donnée. Pour chaque champ en conflit (valeurs différentes et non
 * vides des deux côtés), on garde la valeur existante par défaut mais
 * on expose l'alternative pour que l'utilisateur tranche dans l'écran
 * de comparaison côte à côte (voir features/import-export/MergeReview.jsx).
 */

const MERGEABLE_FIELDS = [
  'firstNames', 'lastName', 'birthName', 'sex',
  'birthDate', 'birthDatePrecision', 'birthPlaceLocalId',
  'deathDate', 'deathDatePrecision', 'deathPlaceLocalId',
  'isDeceased', 'occupation', 'biography',
];

function mergeField(fieldName, existingValue, incomingValue) {
  const a = existingValue ?? null;
  const b = incomingValue ?? null;

  if (a === b) return { value: a, conflict: false };
  if (a === null || a === '') return { value: b, conflict: false, tookIncoming: true };
  if (b === null || b === '') return { value: a, conflict: false };

  // Les deux côtés ont une valeur différente et non vide : conflit réel.
  return { value: a, alternative: b, conflict: true };
}

/**
 * Fusionne un individu existant et un individu entrant.
 * Retourne { merged, conflicts } où `merged` contient les valeurs
 * retenues par défaut (côté existant en cas de conflit) et `conflicts`
 * la liste des champs à trancher manuellement dans l'UI.
 */
export function mergeIndividuals(existing, incoming) {
  const merged = { ...existing };
  const conflicts = [];

  for (const field of MERGEABLE_FIELDS) {
    const result = mergeField(field, existing[field], incoming[field]);
    merged[field] = result.value;
    if (result.conflict) {
      conflicts.push({ field, existingValue: existing[field], incomingValue: incoming[field] });
    }
  }

  // Biographie : si les deux existent et diffèrent, on les concatène
  // plutôt que de forcer un choix (aucune information n'est perdue).
  if (existing.biography && incoming.biography && existing.biography !== incoming.biography) {
    merged.biography = `${existing.biography}\n\n--- Note importée ---\n${incoming.biography}`;
    merged.biographyAutoMerged = true;
  }

  // On conserve une trace de la provenance pour l'audit.
  merged.mergedFromGedcomXref = incoming.gedcomXref || null;
  merged.importBatchId = incoming.importBatchId || null;

  return { merged, conflicts };
}

/**
 * Applique les choix de l'utilisateur (field -> 'existing' | 'incoming')
 * sur le résultat d'un mergeIndividuals() pour produire la version finale.
 */
export function applyConflictResolutions(mergeResult, resolutions) {
  const { merged, conflicts } = mergeResult;
  const final = { ...merged };
  for (const conflict of conflicts) {
    const choice = resolutions[conflict.field]; // 'existing' | 'incoming'
    final[conflict.field] = choice === 'incoming' ? conflict.incomingValue : conflict.existingValue;
  }
  return final;
}
