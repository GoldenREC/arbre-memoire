/**
 * Transforme un fichier d'import personnalisé validé (voir validate.js et
 * docs/IMPORT_FORMAT.md) en modèle de staging — même forme que
 * mapGedcomToStagingModel (lib/gedcom/mapper.js), pour réutiliser tel
 * quel commitImport.js et l'écran de revue des doublons (MergeReview).
 *
 * Deux différences avec le modèle GEDCOM, toutes deux supportées
 * nativement par commitImport.js :
 *  - les lieux portent un objet `structured` (9 champs) plutôt qu'un
 *    simple `rawLabel` ;
 *  - les unions portent `partnerLocalIds` (liste libre) plutôt que
 *    `husbandLocalId`/`wifeLocalId`.
 *
 * Retourne en plus `proofs[]`, traité à part par attachProofs.js une
 * fois les vrais UUID connus (après commitImport).
 */
import { composePlaceLabel, isPlaceEmpty } from '../utils/placeLabel.js';

function fullName(ind) {
  return [ind.firstNames, ind.lastName].filter(Boolean).join(' ') || 'sans nom';
}

function registerPlace(placesMap, structured) {
  if (!structured || isPlaceEmpty(structured)) return null;
  const label = composePlaceLabel(structured);
  if (!label) return null;
  const key = label.toLowerCase();
  if (!placesMap.has(key)) {
    placesMap.set(key, { localId: `place:${placesMap.size + 1}`, structured });
  }
  return placesMap.get(key).localId;
}

function mapIndividual(ind, placesMap, proofs) {
  const birthPlaceLocalId = registerPlace(placesMap, ind.birth?.place);
  const deathPlaceLocalId = ind.isDeceased ? registerPlace(placesMap, ind.death?.place) : null;

  if (ind.birth?.proof) {
    proofs.push({
      subjectKind: 'individual',
      subjectLocalId: ind.localId,
      eventType: 'birth',
      snapshot: { date: ind.birth.date || null, datePrecision: ind.birth.datePrecision || 'unknown', placeLocalId: birthPlaceLocalId },
      proof: ind.birth.proof,
      title: `Acte de naissance — ${fullName(ind)}`,
    });
  }
  if (ind.isDeceased && ind.death?.proof) {
    proofs.push({
      subjectKind: 'individual',
      subjectLocalId: ind.localId,
      eventType: 'death',
      snapshot: { date: ind.death.date || null, datePrecision: ind.death.datePrecision || 'unknown', placeLocalId: deathPlaceLocalId },
      proof: ind.death.proof,
      title: `Acte de décès — ${fullName(ind)}`,
    });
  }

  return {
    localId: ind.localId,
    firstNames: ind.firstNames || null,
    lastName: ind.lastName || null,
    birthName: ind.birthName || null,
    nickname: ind.nickname || null,
    sex: ind.sex || 'U',
    birthDate: ind.birth?.date || null,
    birthDatePrecision: ind.birth?.datePrecision || (ind.birth?.date ? 'exact' : 'unknown'),
    birthPlaceLocalId,
    deathDate: ind.isDeceased ? ind.death?.date || null : null,
    deathDatePrecision: ind.isDeceased ? ind.death?.datePrecision || (ind.death?.date ? 'exact' : 'unknown') : 'unknown',
    deathPlaceLocalId,
    isDeceased: !!ind.isDeceased,
    occupation: ind.occupation || null,
    biography: ind.biography || null,
  };
}

/** Type d'union résolu : explicite (u.unionType) sinon déduit de u.status — on ne présume jamais un mariage par défaut (voir docs/IMPORT_FORMAT.md). */
function resolveUnionType(u) {
  if (u.unionType) return u.unionType;
  if (u.status === 'divorced' || u.status === 'widowed') return 'marriage'; // on ne peut divorcer/être veuf que d'un mariage
  return 'unknown';
}

function mapUnion(u, placesMap, proofs) {
  const placeLocalId = registerPlace(placesMap, u.place);
  const unionType = resolveUnionType(u);
  const isMarriage = unionType === 'marriage';
  // `marriage` (optionnel) décrit le jalon mariage comme un événement à
  // part, indépendant de la mise en couple — voir unionMutations.js côté
  // site. Dès qu'il est présent, startDate/place ci-dessus ne représentent
  // plus que la mise en couple, même pour une union de type "marriage"
  // (sinon, comportement historique inchangé : startDate fait doublon de
  // mariage pour rester compatible avec les fichiers déjà écrits).
  const hasOwnMarriageMilestone = u.marriage !== undefined && u.marriage !== null;
  const marriagePlaceLocalId = hasOwnMarriageMilestone ? registerPlace(placesMap, u.marriage.place) : null;
  const divorcePlaceLocalId = registerPlace(placesMap, u.divorcePlace);

  if (u.proof) {
    proofs.push({
      subjectKind: 'union',
      subjectLocalId: u.localId,
      eventType: hasOwnMarriageMilestone ? 'union_start' : isMarriage ? 'marriage' : 'union_start',
      snapshot: { date: u.startDate || null, datePrecision: u.startDatePrecision || 'unknown', placeLocalId },
      proof: u.proof,
      title: hasOwnMarriageMilestone || !isMarriage ? 'Mise en couple' : 'Acte de mariage',
    });
  }
  if (hasOwnMarriageMilestone && u.marriage.proof) {
    proofs.push({
      subjectKind: 'union',
      subjectLocalId: u.localId,
      eventType: 'marriage',
      snapshot: { date: u.marriage.date || null, datePrecision: u.marriage.datePrecision || 'unknown', placeLocalId: marriagePlaceLocalId },
      proof: u.marriage.proof,
      title: 'Acte de mariage',
    });
  }
  // Preuve distincte pour le divorce (jugement) — rattachée à l'événement
  // "divorce" généré par commitImport.js (insertDerivedEvents) à partir de
  // endDate/endDatePrecision, et non à l'acte de mariage lui-même.
  if (u.divorceProof && u.endDate) {
    proofs.push({
      subjectKind: 'union',
      subjectLocalId: u.localId,
      eventType: 'divorce',
      snapshot: { date: u.endDate, datePrecision: u.endDatePrecision || 'unknown', placeLocalId: divorcePlaceLocalId },
      proof: u.divorceProof,
      title: 'Jugement de divorce',
    });
  }

  return {
    localId: u.localId,
    partnerLocalIds: u.partners,
    unionType,
    status: u.status || 'unknown',
    startDate: u.startDate || null,
    startDatePrecision: u.startDatePrecision || (u.startDate ? 'exact' : 'unknown'),
    placeLocalId,
    endDate: u.endDate || null,
    endDatePrecision: u.endDatePrecision || (u.endDate ? 'exact' : 'unknown'),
    splitMarriageMilestone: hasOwnMarriageMilestone,
    marriageDate: hasOwnMarriageMilestone ? u.marriage.date || null : null,
    marriageDatePrecision: hasOwnMarriageMilestone ? u.marriage.datePrecision || (u.marriage.date ? 'exact' : 'unknown') : 'unknown',
    marriagePlaceLocalId,
    divorcePlaceLocalId,
  };
}

/** Le couple exact de parents de `childLocalId` correspond-il aux partenaires d'une union connue ? */
function findParentalUnion(parentLocalIds, unions) {
  if (parentLocalIds.length < 2) return null;
  const parentSet = new Set(parentLocalIds);
  const match = unions.find((u) => {
    const partnerSet = new Set(u.partners);
    return partnerSet.size === parentSet.size && [...partnerSet].every((id) => parentSet.has(id));
  });
  return match ? match.localId : null;
}

export function mapCustomImportToStagingModel(model) {
  const placesMap = new Map();
  const proofs = [];

  const individuals = model.individuals.map((ind) => mapIndividual(ind, placesMap, proofs));
  const families = (model.unions || []).map((u) => mapUnion(u, placesMap, proofs));

  const filiations = [];
  for (const ind of model.individuals) {
    // Chaque entrée de "parents" est soit un localId (texte, filiation biologique
    // implicite — rétrocompatible), soit { id, filiationType } pour une filiation
    // non biologique (adoption, famille d'accueil, reconnaissance tardive...).
    const parentEntries = (ind.parents || []).map((p) =>
      typeof p === 'string' ? { id: p, filiationType: 'biological' } : { id: p.id, filiationType: p.filiationType || 'biological' }
    );
    const parentIds = parentEntries.map((p) => p.id);
    const unionLocalId = findParentalUnion(parentIds, model.unions || []);
    for (const { id: parentLocalId, filiationType } of parentEntries) {
      filiations.push({ childLocalId: ind.localId, parentLocalId, unionLocalId, filiationType });
    }
  }

  return {
    individuals,
    families,
    filiations,
    sources: [],
    places: Array.from(placesMap.values()),
    proofs,
    stats: {
      individualCount: individuals.length,
      familyCount: families.length,
    },
  };
}
