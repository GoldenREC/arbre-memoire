/**
 * Tracé des liens parent → enfant, en traits orthogonaux.
 * Chaque lien est un trait unique, de la couleur de son type : il descend du parent,
 * file sur sa propre voie horizontale, puis rejoint le haut de l'enfant.
 * Les voies sont distinctes dans une même gouttière, pour que deux liens ne se confondent jamais.
 */
const LANE_STEP = 9;
const ARRIVAL_STEP = 10;

export function linkPaths(links) {
  // Groupes de liens par gouttière (même hauteur de départ/arrivée) : une voie par lien.
  const byGap = new Map();
  for (const l of links) {
    const key = `${Math.round(l.y1)}-${Math.round(l.y2)}`;
    if (!byGap.has(key)) byGap.set(key, []);
    byGap.get(key).push(l);
  }
  const paths = [];
  for (const group of byGap.values()) {
    group.sort((p, q) => p.x2 - q.x2 || p.x1 - q.x1);
    // Points d'arrivée : plusieurs parents d'un même enfant arrivent à des endroits différents du haut de la carte.
    const perChild = new Map();
    for (const l of group) perChild.set(l.childId, (perChild.get(l.childId) || 0) + 1);
    const seen = new Map();
    group.forEach((l, lane) => {
      const count = perChild.get(l.childId);
      const k = seen.get(l.childId) || 0;
      seen.set(l.childId, k + 1);
      const arrivalX = l.x2 + (k - (count - 1) / 2) * ARRIVAL_STEP;
      const midY = (l.y1 + l.y2) / 2;
      const laneY = midY + (lane - (group.length - 1) / 2) * LANE_STEP;
      paths.push({
        parentId: l.parentId,
        childId: l.childId,
        d: `M ${l.x1} ${l.y1} L ${l.x1} ${laneY} L ${arrivalX} ${laneY} L ${arrivalX} ${l.y2}`,
      });
    });
  }
  return paths;
}
