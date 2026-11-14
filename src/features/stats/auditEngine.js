/**
 * Moteur d'audit : détection automatique d'incohérences chronologiques,
 * de doublons potentiels et de fiches isolées. Fonctions pures,
 * opérant sur les données chargées par statsData.js — chaque résultat
 * ({ id, severity, message, individualIds }) porte les identifiants
 * nécessaires pour naviguer directement vers les fiches concernées.
 *
 * Les seuils utilisés (âge au mariage, délai de naissance posthume...)
 * sont des heuristiques raisonnables, pas des règles biologiques
 * strictes : ils signalent des cas à vérifier, jamais une certitude
 * d'erreur.
 */
import { computeAge } from '../../lib/utils/dates.js';
import { stringSimilarity, computeIndividualSimilarity } from '../../lib/dedupe/similarity.js';

function fullName(ind) {
  return `${ind?.firstNames || ''} ${ind?.lastName || ''}`.trim() || 'Personne inconnue';
}

function daysBetween(a, b) {
  return (new Date(b) - new Date(a)) / (1000 * 60 * 60 * 24);
}

/**
 * Incohérences chronologiques : décès avant naissance, parent né
 * après (ou presque en même temps que) son enfant, enfant né plus de
 * ~330 jours après le décès du parent, mariage à un âge aberrant.
 */
export function detectDateAnomalies(individuals, filiations, unions, partnersByUnion) {
  const byId = new Map(individuals.map((i) => [i.id, i]));
  const findings = [];

  for (const ind of individuals) {
    if (ind.birthDate && ind.deathDate && new Date(ind.deathDate) < new Date(ind.birthDate)) {
      findings.push({
        id: `death-before-birth:${ind.id}`,
        kind: 'death_before_birth',
        severity: 'high',
        message: `${fullName(ind)} : date de décès antérieure à la date de naissance.`,
        individualIds: [ind.id],
      });
    }
  }

  for (const f of filiations) {
    const parent = byId.get(f.parentId);
    const child = byId.get(f.childId);
    if (!parent?.birthDate || !child?.birthDate) continue;
    const ageAtBirth = computeAge(parent.birthDate, child.birthDate);
    if (ageAtBirth != null && ageAtBirth < 0) {
      findings.push({
        id: `parent-after-child:${f.id}`,
        kind: 'parent_born_after_child',
        severity: 'high',
        message: `${fullName(parent)} est enregistré·e comme parent de ${fullName(child)} mais né·e après lui/elle.`,
        individualIds: [parent.id, child.id],
      });
    } else if (ageAtBirth != null && ageAtBirth < 12) {
      findings.push({
        id: `parent-too-young:${f.id}`,
        kind: 'parent_too_young',
        severity: 'medium',
        message: `${fullName(parent)} n'avait que ${ageAtBirth} ans à la naissance de ${fullName(child)} — à vérifier.`,
        individualIds: [parent.id, child.id],
      });
    }
    if (parent.deathDate && child.birthDate && daysBetween(parent.deathDate, child.birthDate) > 330) {
      findings.push({
        id: `child-after-parent-death:${f.id}`,
        kind: 'child_born_after_parent_death',
        severity: 'medium',
        message: `${fullName(child)} est né·e plus de 330 jours après le décès de ${fullName(parent)}.`,
        individualIds: [parent.id, child.id],
      });
    }
  }

  for (const union of unions) {
    if (!union.startDate) continue;
    for (const pid of partnersByUnion.get(union.id) || []) {
      const person = byId.get(pid);
      if (!person?.birthDate) continue;
      const age = computeAge(person.birthDate, union.startDate);
      if (age == null) continue;
      if (age < 12 || age > 100) {
        findings.push({
          id: `marriage-age:${union.id}:${pid}`,
          kind: 'marriage_aberrant_age',
          severity: age < 12 ? 'high' : 'medium',
          message: `${fullName(person)} avait ${age} ans lors de cette union — âge à vérifier.`,
          individualIds: [pid],
        });
      }
    }
  }

  return findings;
}

function normalizeName(str) {
  return (str || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-zA-Z\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

// Même seuil que l'appariement à l'import (lib/dedupe/similarity.js,
// findDuplicateCandidates) — on veut la même rigueur de détection pour
// les doublons déjà écrits en base que pour ceux repérés avant import.
const NAME_SIMILARITY_THRESHOLD = 0.72;

/**
 * Deux noms se ressemblent-ils assez pour suspecter un doublon ? Égalité
 * stricte après normalisation (comportement historique), ou similarité
 * floue (distance de Levenshtein, via stringSimilarity) au-delà du
 * seuil — attrape les variantes de transcription d'un même nom (ex.
 * "Ternay" / "Ternaye", un accent oublié, une lettre en trop).
 */
function namesLikelyMatch(a, b) {
  const aFirst = normalizeName(a.firstNames);
  const bFirst = normalizeName(b.firstNames);
  const aLast = normalizeName(a.lastName);
  const bLast = normalizeName(b.lastName);
  if (!aFirst && !bFirst && !aLast && !bLast) return false;
  if (aFirst === bFirst && aLast === bLast) return !!(aFirst || aLast);
  const lastSim = aLast || bLast ? stringSimilarity(aLast, bLast) : 1;
  const firstSim = aFirst || bFirst ? stringSimilarity(aFirst, bFirst) : 1;
  return lastSim >= NAME_SIMILARITY_THRESHOLD && firstSim >= NAME_SIMILARITY_THRESHOLD;
}

/**
 * Doublons potentiels : individus distincts dont le nom se ressemble
 * assez (voir namesLikelyMatch — tolère les variantes de transcription,
 * pas seulement l'égalité stricte) et dont la date de naissance est
 * identique ou très proche (± yearTolerance), ou le même nom sans
 * aucune date connue des deux côtés pour les départager.
 */
export function detectPotentialDuplicates(individuals, { yearTolerance = 2 } = {}) {
  const findings = [];
  for (let i = 0; i < individuals.length; i++) {
    for (let j = i + 1; j < individuals.length; j++) {
      const a = individuals[i];
      const b = individuals[j];
      if (a.sex && b.sex && a.sex !== 'U' && b.sex !== 'U' && a.sex !== b.sex) continue;
      if (!namesLikelyMatch(a, b)) continue;

      let reason;
      if (a.birthDate && b.birthDate) {
        const yearsApart = Math.abs(new Date(a.birthDate) - new Date(b.birthDate)) / (1000 * 60 * 60 * 24 * 365.25);
        if (yearsApart > yearTolerance) continue;
        reason = yearsApart === 0 ? 'même nom et même date de naissance' : `même nom, naissances à ${yearsApart.toFixed(1)} an(s) d'écart`;
      } else {
        reason = 'même nom, sans date de naissance connue pour les départager';
      }

      findings.push({
        id: `duplicate:${a.id}:${b.id}`,
        kind: 'potential_duplicate',
        severity: a.birthDate && b.birthDate ? 'medium' : 'low',
        message: `${fullName(a)} et ${fullName(b)} pourraient être la même personne (${reason}).`,
        individualIds: [a.id, b.id],
      });
    }
  }
  return findings;
}

/**
 * Unions potentiellement dupliquées : deux unions distinctes dont les
 * partenaires sont soit strictement les mêmes (cas qui devrait déjà
 * être nettoyé par cleanup_tree_event_duplicates côté base — signalé
 * ici en garde-fou si ce nettoyage n'a pas encore été lancé), soit
 * composés de personnes très proches par nom/date (computeIndividualSimilarity,
 * même moteur que l'appariement à l'import) sans être les mêmes fiches —
 * typiquement deux fiches en double qui ont chacune leur propre union
 * avec le même conjoint. Ce second cas explique la plupart des
 * "mariages fantômes" qui faussent la carte et les statistiques par
 * lieu : fusionner les fiches en double correspondantes (voir
 * detectPotentialDuplicates ci-dessus) règle aussi ce doublon d'union.
 */
export function detectDuplicateUnions(unions, partnersByUnion, individualsById, { nameSimilarityThreshold = NAME_SIMILARITY_THRESHOLD } = {}) {
  function matchPartners(idsA, idsB) {
    if (idsA.length < 2 || idsA.length !== idsB.length) return null;
    const exact = idsA.slice().sort().join(',') === idsB.slice().sort().join(',');
    const remaining = idsB.slice();
    const pairs = [];
    for (const idA of idsA) {
      const a = individualsById.get(idA);
      let bestIdx = -1;
      let bestScore = -1;
      for (let k = 0; k < remaining.length; k++) {
        const idB = remaining[k];
        if (idA === idB) { bestIdx = k; bestScore = 1; break; }
        const b = individualsById.get(idB);
        if (!a || !b) continue;
        if (a.sex && b.sex && a.sex !== 'U' && b.sex !== 'U' && a.sex !== b.sex) continue;
        const { score } = computeIndividualSimilarity(a, b);
        if (score > bestScore) { bestScore = score; bestIdx = k; }
      }
      if (bestIdx === -1) return null;
      pairs.push({ idA, idB: remaining[bestIdx], score: bestScore });
      remaining.splice(bestIdx, 1);
    }
    return { exact, pairs };
  }

  const findings = [];
  const seen = new Set();
  for (let i = 0; i < unions.length; i++) {
    for (let j = i + 1; j < unions.length; j++) {
      const uA = unions[i];
      const uB = unions[j];
      const idsA = partnersByUnion.get(uA.id) || [];
      const idsB = partnersByUnion.get(uB.id) || [];
      const match = matchPartners(idsA, idsB);
      if (!match) continue;
      if (!match.exact && !match.pairs.every((p) => p.score >= nameSimilarityThreshold)) continue;

      const key = [uA.id, uB.id].sort().join(':');
      if (seen.has(key)) continue;
      seen.add(key);

      const names = match.pairs.map((p) => fullName(individualsById.get(p.idA))).join(' et ');
      findings.push({
        id: `duplicate-union:${key}`,
        kind: match.exact ? 'duplicate_union_exact' : 'duplicate_union_likely',
        severity: match.exact ? 'high' : 'medium',
        message: match.exact
          ? `Deux unions distinctes partagent exactement les mêmes partenaires (${names}) — utilise le bouton "Nettoyer les doublons" en haut de la page pour les fusionner.`
          : `Ces deux unions semblent concerner le même couple (${names}), probablement parce que l'un des deux conjoints a une fiche en double dans l'arbre — fusionner les fiches en double correspondantes réglera aussi ce doublon d'union.`,
        individualIds: [...new Set([...idsA, ...idsB])],
        unionIds: [uA.id, uB.id],
      });
    }
  }
  return findings;
}

/** Fiches isolées : aucun lien de filiation (ni parent ni enfant) et aucune union connue. */
export function detectOrphans(individuals, filiations, unionPartners) {
  const connected = new Set();
  for (const f of filiations) {
    connected.add(f.parentId);
    connected.add(f.childId);
  }
  for (const p of unionPartners) connected.add(p.individual_id);

  return individuals
    .filter((ind) => !connected.has(ind.id))
    .map((ind) => ({
      id: `orphan:${ind.id}`,
      kind: 'orphan',
      severity: 'low',
      message: `${fullName(ind)} n'est rattaché·e à personne dans l'arbre (aucun parent, enfant ou union enregistré).`,
      individualIds: [ind.id],
    }));
}

const SEVERITY_ORDER = { high: 0, medium: 1, low: 2 };

/** Regroupe et trie l'ensemble des constats, du plus sévère au moins sévère. */
export function runFullAudit({ individuals, filiations, unions, partnersByUnion, unionPartners }) {
  const individualsById = new Map(individuals.map((i) => [i.id, i]));
  const findings = [
    ...detectDateAnomalies(individuals, filiations, unions, partnersByUnion),
    ...detectPotentialDuplicates(individuals),
    ...detectDuplicateUnions(unions, partnersByUnion, individualsById),
    ...detectOrphans(individuals, filiations, unionPartners),
  ];
  return findings.sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity]);
}
