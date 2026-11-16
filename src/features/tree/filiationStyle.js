import { filiationRank } from '../../lib/filiation/rank.js';

/** Style des liens enfant/parent selon le type de filiation (couleur, tirets). */
export const FILIATION_STYLE = {
  biological: { color: '#15803d' },
  adoption_plenary: { color: '#2563eb', dash: '6 4' },
  adoption_simple: { color: '#7c3aed', dash: '6 4' },
  foster: { color: '#0f766e', dash: '10 3 2 3' },
  late_recognition: { color: '#ca8a04', dash: '6 4' },
  abandoned: { color: '#dc2626', dash: '2 3' },
  biological_unrecognized: { color: '#dc2626', dash: '2 3' },
  unknown: { color: '#dc2626', dash: '2 3' },
};

/**
 * Style du lien entre un enfant et un parent : on garde le lien le plus fort
 * (même règle que la fiche), pas le premier trouvé.
 */
export function linkStyle(graph, childId, parentIds) {
  const rows = (graph.parentsOf?.get(childId) || graph.getParents(childId)).filter((l) => parentIds.includes(l.parentId));
  const best = rows.reduce((b, l) => (!b || filiationRank(l.filiationType) > filiationRank(b.filiationType) ? l : b), null);
  return FILIATION_STYLE[best?.filiationType] || FILIATION_STYLE.unknown;
}

/** Trait d'union entre deux conjoints : marié ou en couple (plein), concubinage (tirets), divorcé ou séparé (tirets ambre). */
export function unionStyle(status, unionType) {
  if (status === 'divorced' || status === 'separated') return { color: '#b45309', dash: '8 4' };
  if (unionType === 'cohabitation') return { color: '#0891b2', dash: '4 3' };
  return { color: '#db2777' };
}
