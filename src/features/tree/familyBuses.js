/**
 * Tracé des liens parent → enfant, en traits orthogonaux.
 * Chaque lien est un trait unique, de la couleur de son type : il descend du parent,
 * file sur sa propre voie horizontale, puis rejoint le haut de l'enfant.
 * Les voies sont distinctes dans une même gouttière, pour que deux liens ne se confondent jamais.
 */
const LANE_STEP = 9;
const ARRIVAL_STEP = 10;

export function linkPaths(links, graph) {
  // Groupes de liens par gouttière (même hauteur de départ/arrivée) : une voie par lien.
  const byGap = new Map();
  for (const l of links) {
    const key = `${Math.round(l.y1)}-${Math.round(l.y2)}`;
    if (!byGap.has(key)) byGap.set(key, []);
    byGap.get(key).push(l);
  }
  const paths = [];
  const merged = mergeCoupleTrunks(links, graph);
  const usedKeys = new Set(merged.flatMap((m) => m.parents.map((pid) => `${m.childId}|${pid}`)));
  for (const m of merged) paths.push(m.path);
  const rest = links.filter((l) => !usedKeys.has(`${l.childId}|${l.parentId}`));
  const byGapRest = new Map();
  for (const l of rest) {
    const key = `${Math.round(l.y1)}-${Math.round(l.y2)}`;
    if (!byGapRest.has(key)) byGapRest.set(key, []);
    byGapRest.get(key).push(l);
  }
  for (const group of byGapRest.values()) {
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

/**
 * Deux parents qui forment un couple et ont le même type de lien vers un enfant
 * se rejoignent en un seul trait, parti du milieu de leur couple.
 */
function mergeCoupleTrunks(links, graph) {
  const out = [];
  if (!graph?.getUnions) return out;
  const byChild = new Map();
  for (const l of links) {
    if (!byChild.has(l.childId)) byChild.set(l.childId, []);
    byChild.get(l.childId).push(l);
  }
  for (const [childId, list] of byChild) {
    const used = new Set();
    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
        const p = list[i];
        const q = list[j];
        if (used.has(p.parentId) || used.has(q.parentId)) continue;
        const typeOf = (l) => graph.parentsOf?.get(childId)?.find((r) => r.parentId === l.parentId)?.filiationType;
        if (!typeOf(p) || typeOf(p) !== typeOf(q)) continue;
        const isCouple = graph.getUnions(p.parentId).some((u) => (u.partnerIds || []).includes(q.parentId));
        if (!isCouple || p.y1 !== q.y1) continue;
        used.add(p.parentId);
        used.add(q.parentId);
        const midX = (p.x1 + q.x1) / 2;
        const midY = (p.y1 + p.y2) / 2;
        out.push({
          childId,
          parents: [p.parentId, q.parentId],
          path: {
            parentId: p.parentId,
            childId,
            parentIds: [p.parentId, q.parentId],
            d: `M ${midX} ${p.y1} L ${midX} ${midY} L ${p.x2} ${midY} L ${p.x2} ${p.y2}`,
          },
        });
      }
    }
  }
  return out;
}

/** Apparence d'une union : grise et fine par défaut ; colorée si l'un des conjoints est survolé. */
export function unionLook(partnerIds, focusId, colour) {
  if (!focusId) return { stroke: '#a3a3a3', strokeWidth: 1, opacity: 1 };
  if ((partnerIds || []).includes(focusId)) return { stroke: colour, strokeWidth: 2.5, opacity: 1 };
  return { stroke: '#a3a3a3', strokeWidth: 1, opacity: 0.25 };
}

/**
 * Apparence d'un lien parental selon la personne survolée : par défaut fin et gris ;
 * si la personne survolée est l'enfant ou le parent du lien, il prend sa couleur et s'épaissit.
 */
export function linkLook(link, focusId, colour) {
  if (!focusId) return { stroke: '#a3a3a3', strokeWidth: 1, opacity: 1 };
  const related = link.childId === focusId || link.parentId === focusId;
  if (related) return { stroke: colour, strokeWidth: 2.5, opacity: 1 };
  return { stroke: '#a3a3a3', strokeWidth: 1, opacity: 0.25 };
}
