/**
 * Regroupe les liens parent → enfant : pour chaque enfant, une barre horizontale
 * où arrivent ses liens parentaux, puis une descente vers l'enfant.
 * Les barres d'enfants situés dans la même gouttière reçoivent chacune leur propre voie,
 * pour qu'une barre ne se confonde jamais avec celle d'un autre enfant.
 */
const LANE_GAP = 14;

export function childBuses(links) {
  const byChild = new Map();
  for (const l of links) {
    if (!byChild.has(l.childId)) byChild.set(l.childId, { childId: l.childId, childX: l.x2, childY: l.y2, drops: [] });
    byChild.get(l.childId).drops.push({ parentId: l.parentId, x: l.x1, fromY: l.y1 });
  }
  const buses = [...byChild.values()].map((b) => {
    const parentBottom = Math.max(...b.drops.map((d) => d.fromY));
    return { ...b, baseY: (parentBottom + b.childY) / 2 };
  });
  // Voie par gouttière : les enfants du même niveau reçoivent des voies distinctes, de gauche à droite.
  const sorted = [...buses].sort((p, q) => p.baseY - q.baseY || p.childX - q.childX);
  const laneOf = new Map();
  const rowCount = new Map();
  for (const b of sorted) {
    const key = Math.round(b.baseY);
    const lane = rowCount.get(key) || 0;
    rowCount.set(key, lane + 1);
    laneOf.set(b, lane);
  }
  return buses.map((b) => {
    const xs = [...b.drops.map((d) => d.x), b.childX];
    return {
      ...b,
      busY: b.baseY + laneOf.get(b) * LANE_GAP,
      minX: Math.min(...xs),
      maxX: Math.max(...xs),
    };
  });
}
