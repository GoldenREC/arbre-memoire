/**
 * Dernier maillon de l'import personnalisé (voir docs/IMPORT_FORMAT.md) :
 * une fois commitImport() exécuté et les vrais UUID connus (individus,
 * unions, lieux), attache les preuves (actes/informations familiales)
 * listées par mapper.js — en réutilisant attachDateProof, la même
 * fonction déjà utilisée par le formulaire de fiche (IndividualCreateForm,
 * CivilHeader) pour une date "Exacte" saisie à la main.
 *
 * Volontairement tolérant aux erreurs individuelles : une pièce jointe en
 * échec (ex. fichier manquant, upload réseau) ne doit pas remettre en
 * cause tout l'import déjà écrit en base — elle est juste signalée dans
 * le résumé retourné, pour que l'utilisateur puisse la rattacher
 * manuellement ensuite depuis la fiche concernée.
 */
import { attachDateProof } from '../individual/actsMutations.js';

/**
 * @param {string} treeId
 * @param {Array} proofs - stagingModel.proofs (voir lib/customImport/mapper.js)
 * @param {{individualIdMap: Map, unionIdMap: Map, placeIdMap: Map}} idMaps - retour de commitImport()
 * @param {Map<string, File>} imagesByPath - retour de parser.js
 * @returns {{ attached: number, failed: Array<{ title: string, error: string }> }}
 */
export async function attachImportProofs(treeId, proofs, { individualIdMap, unionIdMap, placeIdMap }, imagesByPath) {
  let attached = 0;
  const failed = [];

  for (const p of proofs || []) {
    try {
      const subjectId =
        p.subjectKind === 'union' ? unionIdMap.get(p.subjectLocalId) : individualIdMap.get(p.subjectLocalId);
      if (!subjectId) {
        throw new Error('Personne ou union correspondante introuvable après écriture (import partiellement rejeté ?).');
      }

      await attachDateProof(treeId, {
        subjectKind: p.subjectKind,
        subjectId,
        individualId: p.subjectKind === 'individual' ? subjectId : null,
        eventType: p.eventType,
        snapshot: {
          date: p.snapshot.date,
          datePrecision: p.snapshot.datePrecision,
          placeId: p.snapshot.placeLocalId ? placeIdMap.get(p.snapshot.placeLocalId) ?? null : null,
        },
        title: p.title,
        proof: {
          type: p.proof.type,
          url: p.proof.url || '',
          file: p.proof.imageFile ? imagesByPath.get(p.proof.imageFile) || null : null,
          reference: p.proof.reference || '',
          repository: p.proof.repository || '',
          transcription: p.proof.transcription || '',
        },
      });
      attached += 1;
    } catch (err) {
      failed.push({ title: p.title, error: err.message || String(err) });
    }
  }

  return { attached, failed };
}
