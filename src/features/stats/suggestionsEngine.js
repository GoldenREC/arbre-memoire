/**
 * Moteur de "Suggestions" : contrairement à l'audit (auditEngine.js, qui
 * signale des incohérences chronologiques ou des doublons de fiches),
 * ce module détecte des coquilles probables de saisie/transcription sur
 * les noms de famille et les lieux — le cas typique étant une variante
 * orthographique rare d'un nom par ailleurs très présent dans l'arbre
 * chez un parent direct (ex: "Cernay" chez un enfant dont le parent
 * s'appelle "Ternay", nom porté par ailleurs par dix autres fiches).
 *
 * Fonctions pures, mêmes conventions que auditEngine.js : chaque
 * résultat porte un `id` stable (utilisé comme clé d'ignorance
 * persistée, voir suggestionActions.js) et un `suggestion` décrivant
 * l'action concrète que le bouton "Modifier cette fiche" déclenchera.
 */
import { stringSimilarity } from '../../lib/dedupe/similarity.js';

function fullName(ind) {
  return `${ind?.firstNames || ''} ${ind?.lastName || ''}`.trim() || 'Personne inconnue';
}

function pluralize(n, word) {
  return `${n} ${word}${n > 1 ? 's' : ''}`;
}

/**
 * Compte, pour chaque orthographe exacte (insensible à la casse) de nom
 * de famille présente dans l'arbre, le nombre de fiches qui la portent.
 */
function buildSpellingCounts(individuals, pickField) {
  const counts = new Map();
  for (const ind of individuals) {
    const raw = (pickField(ind) || '').trim();
    if (!raw) continue;
    const key = raw.toLowerCase();
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  return counts;
}

/**
 * Compare le nom de famille de chaque enfant (filiation biologique
 * uniquement — une adoption ou un accueil n'implique aucune parenté de
 * nom) à celui de chacun de ses parents. Si les deux orthographes sont
 * proches (distance de Levenshtein faible) sans être identiques, et que
 * l'orthographe du parent est nettement plus répandue dans l'arbre que
 * celle de l'enfant, on suggère qu'il s'agit probablement de la même
 * famille mal transcrite.
 *
 * @param {Array} individuals - { id, firstNames, lastName, ... }
 * @param {Array} filiations - { childId, parentId, filiationType }
 * @param {Object} [options]
 * @param {number} [options.minSimilarity=0.6] - seuil de ressemblance (0..1, 1 = identique)
 * @param {number} [options.dominanceRatio=3] - l'orthographe du parent doit être au moins N fois plus fréquente
 * @param {number} [options.minDominantCount=2] - l'orthographe dominante doit être portée par au moins N fiches
 */
export function detectSurnameInconsistencies(
  individuals,
  filiations,
  { minSimilarity = 0.6, dominanceRatio = 3, minDominantCount = 2 } = {}
) {
  const byId = new Map(individuals.map((i) => [i.id, i]));
  const spellingCounts = buildSpellingCounts(individuals, (i) => i.lastName);
  const findings = [];
  const seen = new Set();

  for (const f of filiations) {
    if (f.filiationType && f.filiationType !== 'biological') continue;
    const child = byId.get(f.childId);
    const parent = byId.get(f.parentId);
    const childName = (child?.lastName || '').trim();
    const parentName = (parent?.lastName || '').trim();
    if (!childName || !parentName) continue;
    if (childName.toLowerCase() === parentName.toLowerCase()) continue;

    const sim = stringSimilarity(childName, parentName);
    if (sim < minSimilarity || sim >= 0.999) continue;

    const childCount = spellingCounts.get(childName.toLowerCase()) || 0;
    const parentCount = spellingCounts.get(parentName.toLowerCase()) || 0;
    if (parentCount < minDominantCount) continue;
    if (parentCount < childCount * dominanceRatio) continue;

    const key = `surname:${child.id}:${childName.toLowerCase()}->${parentName.toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);

    findings.push({
      id: key,
      kind: 'surname_mismatch',
      message: `${fullName(child)} porte le nom « ${childName} » (${pluralize(childCount, 'fiche')}), alors que son parent ${fullName(parent)} porte « ${parentName} » (${pluralize(parentCount, 'fiche')}) — coquille de transcription probable.`,
      individualIds: [child.id, parent.id],
      suggestion: {
        type: 'rename_individual',
        individualId: child.id,
        individualLabel: fullName(child),
        field: 'lastName',
        from: childName,
        to: parentName,
      },
    });
  }

  return findings;
}

function cityOf(place) {
  return (place?.rawLabel || '').split(',')[0].trim();
}

/**
 * Compare chaque paire de lieux distincts de l'arbre dont le premier
 * segment (la commune) se ressemble sans être identique. Un lieu n'est
 * comparé à un autre que si leur région et leur pays, lorsqu'ils sont
 * connus des deux côtés, concordent — pour éviter de rapprocher deux
 * communes homonymes-approchantes mais réellement distinctes situées
 * dans des régions différentes. Comme pour les noms de famille, la
 * suggestion n'apparaît que si l'une des deux orthographes est
 * nettement plus utilisée dans l'arbre que l'autre.
 *
 * @param {Array} places - { id, rawLabel, region, country }
 * @param {Map} usageCountByPlaceId - nombre de références (naissance, décès, union, événement) par lieu
 */
export function detectPlaceInconsistencies(
  places,
  usageCountByPlaceId,
  { minSimilarity = 0.65, dominanceRatio = 3, minDominantCount = 2 } = {}
) {
  const findings = [];
  const seen = new Set();

  for (let i = 0; i < places.length; i++) {
    for (let j = i + 1; j < places.length; j++) {
      const a = places[i];
      const b = places[j];
      const cityA = cityOf(a);
      const cityB = cityOf(b);
      if (!cityA || !cityB) continue;
      if (cityA.toLowerCase() === cityB.toLowerCase()) continue;
      if (a.region && b.region && a.region !== b.region) continue;
      if (a.country && b.country && a.country !== b.country) continue;

      const sim = stringSimilarity(cityA, cityB);
      if (sim < minSimilarity || sim >= 0.999) continue;

      const countA = usageCountByPlaceId.get(a.id) || 0;
      const countB = usageCountByPlaceId.get(b.id) || 0;
      if (countA === 0 || countB === 0) continue;

      const [rare, dominant] =
        countA <= countB ? [{ place: a, count: countA }, { place: b, count: countB }] : [{ place: b, count: countB }, { place: a, count: countA }];
      if (dominant.count < minDominantCount) continue;
      if (dominant.count < rare.count * dominanceRatio) continue;

      const key = `place:${rare.place.id}:${dominant.place.id}`;
      if (seen.has(key)) continue;
      seen.add(key);

      findings.push({
        id: key,
        kind: 'place_mismatch',
        message: `« ${rare.place.rawLabel} » (${pluralize(rare.count, 'usage')}) ressemble à « ${dominant.place.rawLabel} » (${pluralize(dominant.count, 'usage')}) — lieu probablement mal orthographié.`,
        individualIds: [],
        suggestion: {
          type: 'merge_place',
          keepPlaceId: dominant.place.id,
          keepLabel: dominant.place.rawLabel,
          removePlaceId: rare.place.id,
          removeLabel: rare.place.rawLabel,
        },
      });
    }
  }

  return findings;
}

/** Regroupe les deux détecteurs de suggestions (noms, lieux). */
export function runSuggestions({ individuals, filiations, places, placeUsageCounts }) {
  return [
    ...detectSurnameInconsistencies(individuals, filiations),
    ...detectPlaceInconsistencies(places, placeUsageCounts),
  ];
}
