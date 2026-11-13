/**
 * Base locale (IndexedDB via Dexie) utilisée UNIQUEMENT comme zone de
 * "staging" pendant l'import GEDCOM : on y dépose les individus/familles
 * parsés avant la revue de fusion/dédoublonnage, pour pouvoir naviguer
 * dans un gros fichier sans tout garder en mémoire JS. Une fois la revue
 * validée, les enregistrements retenus sont écrits dans Supabase (source
 * de vérité) et la zone de staging est vidée.
 */
import Dexie from 'dexie';

export const localDb = new Dexie('genealogie_staging');

localDb.version(1).stores({
  // localId = clé générée par le mapper GEDCOM (ex: "gedcom:I1")
  stagedIndividuals: 'localId, lastName, gedcomXref',
  stagedFamilies: 'localId, gedcomXref',
  stagedFiliations: '++id, childLocalId, parentLocalId',
  stagedPlaces: 'localId',
  stagedSources: 'localId',
  // Résultat du rapprochement de doublons, pour reprendre une revue en cours
  duplicateDecisions: 'incomingLocalId, existingId, decision',
});

export async function clearStagingArea() {
  await Promise.all([
    localDb.stagedIndividuals.clear(),
    localDb.stagedFamilies.clear(),
    localDb.stagedFiliations.clear(),
    localDb.stagedPlaces.clear(),
    localDb.stagedSources.clear(),
    localDb.duplicateDecisions.clear(),
  ]);
}

export async function saveStagingModel(model) {
  await clearStagingArea();
  await localDb.stagedIndividuals.bulkAdd(model.individuals);
  await localDb.stagedFamilies.bulkAdd(model.families);
  await localDb.stagedFiliations.bulkAdd(model.filiations);
  await localDb.stagedPlaces.bulkAdd(model.places);
  await localDb.stagedSources.bulkAdd(model.sources);
}
