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

/**
 * Doublons potentiels : individus distincts partageant le même nom
 * normalisé (prénoms + nom) et une date de naissance identique ou
 * très proche (± yearTolerance), ou le même nom sans aucune date
 * connue des deux côtés pour les départager.
 */
export function detectPotentialDuplicates(individuals, { yearTolerance = 2 } = {}) {
  const byName = new Map();
  for (const ind of individuals) {
    const key = normalizeName(`${ind.firstNames} ${ind.lastName}`);
    if (!key) continue;
    if (!byName.has(key)) byName.set(key, []);
    byName.get(key).push(ind);
  }

  const findings = [];
  for (const [, group] of byName) {
    if (group.length < 2) continue;
    for (let i = 0; i < group.length; i++) {
      for (let j = i + 1; j < group.length; j++) {
        const a = group[i];
        const b = group[j];
        if (a.sex && b.sex && a.sex !== 'U' && b.sex !== 'U' && a.sex !== b.sex) continue;

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
  const findings = [
    ...detectDateAnomalies(individuals, filiations, unions, partnersByUnion),
    ...detectPotentialDuplicates(individuals),
    ...detectOrphans(individuals, filiations, unionPartners),
  ];
  return findings.sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity]);
}
