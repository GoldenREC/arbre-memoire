/**
 * Calcul de similarité pour la détection de doublons lors d'un import.
 * Combine : nom/prénom (distance de Levenshtein normalisée), proximité
 * de date de naissance, et correspondance de lieu.
 */

function normalizeString(str) {
  if (!str) return '';
  return str
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '') // enlève les accents
    .replace(/[^a-z0-9\s]/g, '')
    .trim();
}

function levenshtein(a, b) {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;

  const prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  const curr = new Array(b.length + 1);

  for (let i = 1; i <= a.length; i++) {
    curr[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(prev[j] + 1, curr[j - 1] + 1, prev[j - 1] + cost);
    }
    for (let j = 0; j <= b.length; j++) prev[j] = curr[j];
  }
  return prev[b.length];
}

/** Similarité de chaîne normalisée dans [0, 1], 1 = identique. */
export function stringSimilarity(a, b) {
  const na = normalizeString(a);
  const nb = normalizeString(b);
  if (!na && !nb) return 1; // deux champs vides : neutre, pas de pénalité
  if (!na || !nb) return 0;
  const dist = levenshtein(na, nb);
  const maxLen = Math.max(na.length, nb.length);
  return maxLen === 0 ? 1 : 1 - dist / maxLen;
}

/** Similarité de date : 1 si identique, dégrade avec l'écart en années. */
export function dateSimilarity(dateA, dateB) {
  if (!dateA && !dateB) return 0.5; // inconnu des deux côtés : ni pour ni contre
  if (!dateA || !dateB) return 0.4;
  const yearA = parseInt(dateA.slice(0, 4), 10);
  const yearB = parseInt(dateB.slice(0, 4), 10);
  if (Number.isNaN(yearA) || Number.isNaN(yearB)) return 0.4;
  const diff = Math.abs(yearA - yearB);
  if (diff === 0) return 1;
  if (diff <= 1) return 0.85;
  if (diff <= 3) return 0.5;
  if (diff <= 10) return 0.2;
  return 0;
}

/**
 * Score global de similarité entre deux individus (0..1) + détail des
 * composantes, pour affichage dans l'assistant de fusion.
 */
export function computeIndividualSimilarity(a, b) {
  const lastNameScore = stringSimilarity(a.lastName, b.lastName);
  const firstNameScore = stringSimilarity(a.firstNames, b.firstNames);
  const birthDateScore = dateSimilarity(a.birthDate, b.birthDate);
  const sexPenalty = a.sex && b.sex && a.sex !== 'U' && b.sex !== 'U' && a.sex !== b.sex ? 0.3 : 0;

  const weighted =
    lastNameScore * 0.35 +
    firstNameScore * 0.25 +
    birthDateScore * 0.3 +
    (1 - sexPenalty) * 0.1;

  return {
    score: Math.max(0, Math.min(1, weighted)),
    details: { lastNameScore, firstNameScore, birthDateScore, sexPenalty },
  };
}

/**
 * Parcourt deux listes d'individus et retourne les paires dont le score
 * dépasse le seuil, triées par score décroissant (meilleurs candidats
 * doublons en premier).
 */
export function findDuplicateCandidates(existingList, incomingList, threshold = 0.72) {
  const candidates = [];
  for (const incoming of incomingList) {
    for (const existing of existingList) {
      const { score, details } = computeIndividualSimilarity(existing, incoming);
      if (score >= threshold) {
        candidates.push({ existing, incoming, score, details });
      }
    }
  }
  return candidates.sort((x, y) => y.score - x.score);
}
