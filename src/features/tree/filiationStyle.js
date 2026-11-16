/** Style des liens enfant/parent selon le type de filiation (couleur, tirets). */
export const FILIATION_STYLE = {
  biological: { color: '#15803d' },
  adoption_plenary: { color: '#2563eb', dash: '6 4' },
  adoption_simple: { color: '#7c3aed', dash: '6 4' },
  foster: { color: '#ea580c', dash: '6 4' },
  late_recognition: { color: '#ca8a04', dash: '6 4' },
  abandoned: { color: '#dc2626', dash: '2 3' },
  biological_unrecognized: { color: '#dc2626', dash: '2 3' },
  unknown: { color: '#dc2626', dash: '2 3' },
};

/** Lien le plus fort d'un enfant vers un de ses parents (type de filiation). */
export function linkStyle(graph, childId, parentIds) {
  const link = graph.getParents(childId).find((l) => parentIds.includes(l.parentId));
  return FILIATION_STYLE[link?.filiationType] || FILIATION_STYLE.unknown;
}
