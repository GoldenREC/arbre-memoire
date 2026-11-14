/**
 * Validation du fichier d'import personnalisé (docs/IMPORT_FORMAT.md) —
 * en amont du mapping vers le modèle de staging (mapper.js). Fonction
 * pure : ne touche jamais au réseau ni au DOM, pour rester testable comme
 * le reste du pipeline d'import (voir lib/gedcom/).
 *
 * Ne renvoie que des chaînes d'erreur lisibles, préfixées par la
 * localisation (index + localId) pour que l'utilisateur puisse corriger
 * le fichier et réessayer — rien n'est à moitié importé.
 */
const SEX_VALUES = ['M', 'F', 'U'];
const DATE_PRECISION_VALUES = ['exact', 'about', 'before', 'after', 'unknown'];
const PROOF_TYPE_VALUES = ['acte', 'family'];
const UNION_STATUS_VALUES = ['ongoing', 'divorced', 'widowed', 'annulled', 'unknown'];
const UNION_TYPE_VALUES = ['marriage', 'civil_union', 'cohabitation', 'unknown'];
const FILIATION_TYPE_VALUES = [
  'biological',
  'adoption_plenary',
  'adoption_simple',
  'foster',
  'late_recognition',
  'unknown',
];
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function isPlainObject(v) {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}

function validatePlaceOnly(place, label, errors) {
  if (place === null || place === undefined) return;
  if (!isPlainObject(place)) {
    errors.push(`${label} : doit être un objet ou null.`);
  }
}

function validateDateFacts(facts, label, errors, availableImagePaths) {
  if (facts === null || facts === undefined) return;
  if (!isPlainObject(facts)) {
    errors.push(`${label} : doit être un objet ou null.`);
    return;
  }
  if (facts.date !== null && facts.date !== undefined && !ISO_DATE_RE.test(facts.date)) {
    errors.push(`${label}.date : "${facts.date}" n'est pas au format AAAA-MM-JJ.`);
  }
  if (facts.datePrecision !== undefined && !DATE_PRECISION_VALUES.includes(facts.datePrecision)) {
    errors.push(`${label}.datePrecision : "${facts.datePrecision}" invalide (attendu : ${DATE_PRECISION_VALUES.join('|')}).`);
  }
  if (facts.place !== null && facts.place !== undefined && !isPlainObject(facts.place)) {
    errors.push(`${label}.place : doit être un objet ou null.`);
  }
  validateProof(facts.proof, `${label}.proof`, errors, availableImagePaths);
}

function validateProof(proof, label, errors, availableImagePaths) {
  if (proof === null || proof === undefined) return;
  if (!isPlainObject(proof)) {
    errors.push(`${label} : doit être un objet ou null.`);
    return;
  }
  if (!PROOF_TYPE_VALUES.includes(proof.type)) {
    errors.push(`${label}.type : "${proof.type}" invalide (attendu : ${PROOF_TYPE_VALUES.join('|')}).`);
    return;
  }
  if (proof.type === 'acte' && !proof.url?.trim() && !proof.imageFile?.trim()) {
    errors.push(`${label} : type "acte" nécessite "url" ou "imageFile".`);
  }
  if (proof.imageFile && availableImagePaths && !availableImagePaths.has(proof.imageFile)) {
    errors.push(`${label}.imageFile : "${proof.imageFile}" est référencé mais absent du .zip (dossier images/).`);
  }
}

/**
 * `availableImagePaths` : Set des chemins réellement présents dans le zip
 * (ex. "images/acte1.jpg"), fourni par parser.js. Laisser undefined pour
 * valider le JSON seul, sans vérifier l'existence des fichiers.
 */
export function validateCustomImport(model, { availableImagePaths } = {}) {
  const errors = [];

  if (!isPlainObject(model)) {
    return ['Le fichier ne contient pas un objet JSON valide.'];
  }
  if (!Array.isArray(model.individuals) || model.individuals.length === 0) {
    errors.push('"individuals" est obligatoire et doit contenir au moins une personne.');
    return errors; // inutile d'aller plus loin sans individus
  }

  const localIds = new Set();
  const duplicateIds = new Set();
  for (const ind of model.individuals) {
    if (!ind.localId || typeof ind.localId !== 'string') {
      errors.push('Une entrée de "individuals" n\'a pas de "localId" (chaîne non vide requise).');
      continue;
    }
    if (localIds.has(ind.localId)) duplicateIds.add(ind.localId);
    localIds.add(ind.localId);
  }
  for (const id of duplicateIds) {
    errors.push(`"localId" "${id}" utilisé plusieurs fois dans "individuals" — doit être unique.`);
  }

  for (const [i, ind] of model.individuals.entries()) {
    const label = `individuals[${i}] (${ind.localId ?? '?'})`;
    if (ind.sex !== undefined && !SEX_VALUES.includes(ind.sex)) {
      errors.push(`${label}.sex : "${ind.sex}" invalide (attendu : ${SEX_VALUES.join('|')}).`);
    }
    if (ind.parents !== undefined) {
      if (!Array.isArray(ind.parents)) {
        errors.push(`${label}.parents : doit être une liste de localId.`);
      } else {
        for (const [pi, parent] of ind.parents.entries()) {
          const parentLabel = `${label}.parents[${pi}]`;
          if (parent === null || parent === undefined) {
            errors.push(
              `${label}.parents : contient un parent inconnu (null) — un parent non identifié ne doit pas apparaître dans la liste, retire simplement cette entrée (ex. ["mere"] au lieu de [null, "mere"]).`
            );
          } else if (typeof parent === 'string') {
            if (!localIds.has(parent)) {
              errors.push(`${label}.parents : référence "${parent}" introuvable dans "individuals".`);
            }
          } else if (isPlainObject(parent)) {
            if (typeof parent.id !== 'string') {
              errors.push(`${parentLabel}.id : requis (localId du parent) quand "parents" contient un objet.`);
            } else if (!localIds.has(parent.id)) {
              errors.push(`${label}.parents : référence "${parent.id}" introuvable dans "individuals".`);
            }
            if (parent.filiationType !== undefined && !FILIATION_TYPE_VALUES.includes(parent.filiationType)) {
              errors.push(
                `${parentLabel}.filiationType : "${parent.filiationType}" invalide (attendu : ${FILIATION_TYPE_VALUES.join('|')}).`
              );
            }
          } else {
            errors.push(
              `${parentLabel} : doit être soit un localId (texte), soit un objet { id, filiationType } — pour un parent adoptif par exemple.`
            );
          }
        }
      }
    }
    validateDateFacts(ind.birth, `${label}.birth`, errors, availableImagePaths);
    if (ind.isDeceased) {
      validateDateFacts(ind.death, `${label}.death`, errors, availableImagePaths);
    }
  }

  const unionIds = new Set();
  for (const [i, u] of (model.unions || []).entries()) {
    const label = `unions[${i}] (${u.localId ?? '?'})`;
    if (!u.localId || typeof u.localId !== 'string') {
      errors.push(`unions[${i}] : "localId" obligatoire.`);
    } else if (unionIds.has(u.localId)) {
      errors.push(`"localId" "${u.localId}" utilisé plusieurs fois dans "unions" — doit être unique.`);
    } else {
      unionIds.add(u.localId);
    }
    if (!Array.isArray(u.partners) || u.partners.length < 2) {
      errors.push(`${label}.partners : doit contenir au moins 2 localId.`);
    } else {
      for (const partnerId of u.partners) {
        if (!localIds.has(partnerId)) {
          errors.push(`${label}.partners : référence "${partnerId}" introuvable dans "individuals".`);
        }
      }
    }
    if (u.status !== undefined && !UNION_STATUS_VALUES.includes(u.status)) {
      errors.push(`${label}.status : "${u.status}" invalide (attendu : ${UNION_STATUS_VALUES.join('|')}).`);
    }
    if (u.unionType !== undefined && !UNION_TYPE_VALUES.includes(u.unionType)) {
      errors.push(`${label}.unionType : "${u.unionType}" invalide (attendu : ${UNION_TYPE_VALUES.join('|')}).`);
    }
    validateDateFacts(
      { date: u.startDate, datePrecision: u.startDatePrecision, place: u.place, proof: u.proof },
      label,
      errors,
      availableImagePaths
    );
    if (u.marriage !== undefined && u.marriage !== null) {
      validateDateFacts(u.marriage, `${label}.marriage`, errors, availableImagePaths);
    }
    if (u.endDate !== undefined && u.endDate !== null && !ISO_DATE_RE.test(u.endDate)) {
      errors.push(`${label}.endDate : "${u.endDate}" n'est pas au format AAAA-MM-JJ.`);
    }
    if (u.endDatePrecision !== undefined && !DATE_PRECISION_VALUES.includes(u.endDatePrecision)) {
      errors.push(`${label}.endDatePrecision : "${u.endDatePrecision}" invalide (attendu : ${DATE_PRECISION_VALUES.join('|')}).`);
    }
    validatePlaceOnly(u.divorcePlace, `${label}.divorcePlace`, errors);
    validateProof(u.divorceProof, `${label}.divorceProof`, errors, availableImagePaths);
  }

  return errors;
}
