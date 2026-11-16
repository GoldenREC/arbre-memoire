/**
 * Tracé des liens parent → enfant, en traits orthogonaux.
 * Chaque lien est un trait unique, de la couleur de son type : il descend du parent,
 * file sur sa propre voie horizontale, puis rejoint le haut de l'enfant.
 * Les voies et les points d'arrivée sont distincts pour tous les traits d'une même gouttière
 * (y compris le trait commun de deux parents), pour que deux liens ne se confondent jamais.
 */
const LANE_STEP = 11;
const ARRIVAL_STEP = 14;
const TRUNK_DROP = 14;

/** Hauteur de la voie horizontale d'un arc d'union (même formule que le tracé de l'arc). */
const ARC_CARD_H = 64;
export function arcBus(a) {
  return Math.max(a.ay, a.by) + ARC_CARD_H / 2 + 22 + a.lane * 12;
}

/** Écarte une hauteur de toute voie réservée (arcs d'union) pour qu'aucun trait ne s'y confonde. */
function avoidReserved(y, reservedYs) {
  let v = y;
  for (let k = 0; k < 10; k++) {
    const hit = reservedYs.find((r) => Math.abs(v - r) < LANE_STEP);
    if (hit === undefined) break;
    v = hit + (v >= hit ? LANE_STEP : -LANE_STEP);
  }
  return v;
}

export function linkPaths(links, graph, reservedYs = []) {
  const items = [];
  const trunks = mergeCoupleTrunks(links, graph);
  const usedKeys = new Set(trunks.flatMap((t) => t.parents.map((pid) => `${t.childId}|${pid}`)));

  for (const t of trunks) {
    const { p, q } = t;
    items.push({
      kind: 'trunk',
      coupleKey: `${[p.parentId, q.parentId].sort().join('|')}|${t.type}`,
      childId: t.childId,
      parentId: p.parentId,
      parentIds: [p.parentId, q.parentId],
      group: `${Math.round(p.y1)}-${Math.round(p.y2)}`,
      x1: (p.x1 + q.x1) / 2,
      x2: p.x2,
      y1: p.y1,
      y2: p.y2,
      yBar: p.y1 + TRUNK_DROP,
      p,
      q,
    });
  }
  for (const l of links) {
    if (usedKeys.has(`${l.childId}|${l.parentId}`)) continue;
    items.push({
      kind: 'single',
      childId: l.childId,
      parentId: l.parentId,
      busKey: `s:${l.parentId}|${graph?.parentsOf?.get(l.childId)?.find((r) => r.parentId === l.parentId)?.filiationType}`,
      group: `${Math.round(l.y1)}-${Math.round(l.y2)}`,
      x1: l.x1,
      x2: l.x2,
      y1: l.y1,
      y2: l.y2,
    });
  }

  // Points d'arrivée : tous les traits d'un même enfant (trait commun compris) arrivent
  // à des endroits différents du haut de la carte, rangés de gauche à droite.
  const perChild = new Map();
  for (const it of items) {
    if (!perChild.has(it.childId)) perChild.set(it.childId, []);
    perChild.get(it.childId).push(it);
  }
  for (const list of perChild.values()) {
    list.sort((a, b) => a.x1 - b.x1);
    list.forEach((it, k) => {
      it.arrivalX = it.x2 + (k - (list.length - 1) / 2) * ARRIVAL_STEP;
    });
  }

  // Voies horizontales : une voie par trait dans chaque gouttière.
  const byGap = new Map();
  for (const it of items) {
    if (!byGap.has(it.group)) byGap.set(it.group, []);
    byGap.get(it.group).push(it);
  }
  // Unités de tracé : un lien seul, ou un bus partagé par tous les enfants d'un même couple
  // (même type de filiation). Chaque unité a une seule horizontale, donc un seul niveau.
  const entries = [];
  for (const group of byGap.values()) {
    const shared = new Map();
    const units = [];
    for (const it of group) {
      if (it.kind === 'trunk') {
        if (!shared.has(it.coupleKey)) {
          shared.set(it.coupleKey, []);
          units.push(shared.get(it.coupleKey));
        }
        shared.get(it.coupleKey).push(it);
      } else {
        // Un même parent, un même type de filiation : un seul bus pour tous ses enfants.
        if (!shared.has(it.busKey)) {
          shared.set(it.busKey, []);
          units.push(shared.get(it.busKey));
        }
        shared.get(it.busKey).push(it);
      }
    }
    units.sort((a, b) => a[0].x2 - b[0].x2 || a[0].x1 - b[0].x1);
    units.forEach((items, lane) => {
      const midY = (items[0].y1 + items[0].y2) / 2;
      entries.push({ items, y: midY + (lane - (units.length - 1) / 2) * LANE_STEP });
    });
  }
  // Séparation globale : deux horizontales, même issues de gouttières différentes,
  // ne peuvent pas être plus proches que LANE_STEP.
  for (const e of entries) e.y = avoidReserved(e.y, reservedYs);
  entries.sort((a, b) => a.y - b.y || a.items[0].x1 - b.items[0].x1);
  let prev = -Infinity;
  for (const e of entries) {
    e.y = avoidReserved(Math.max(e.y, prev + LANE_STEP), reservedYs);
    prev = e.y;
  }

  const paths = [];
  for (const { items, y: laneY } of entries) for (const it of items) {
    if (it.kind === 'trunk') {
      const { p, q } = it;
      paths.push({
        parentId: it.parentId,
        childId: it.childId,
        parentIds: it.parentIds,
        d: `M ${p.x1} ${p.y1} L ${p.x1} ${it.yBar} L ${q.x1} ${it.yBar} L ${q.x1} ${q.y1} M ${it.x1} ${it.yBar} L ${it.x1} ${laneY} L ${it.arrivalX} ${laneY} L ${it.arrivalX} ${it.y2}`,
      });
    } else {
      paths.push({
        parentId: it.parentId,
        childId: it.childId,
        d: `M ${it.x1} ${it.y1} L ${it.x1} ${laneY} L ${it.arrivalX} ${laneY} L ${it.arrivalX} ${it.y2}`,
      });
    }
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
        out.push({ childId, parents: [p.parentId, q.parentId], p, q, type: typeOf(p) });
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
  const parentIds = link.parentIds || [link.parentId];
  const related = link.childId === focusId || parentIds.includes(focusId);
  if (related) return { stroke: colour, strokeWidth: 2.5, opacity: 1 };
  return { stroke: '#a3a3a3', strokeWidth: 1, opacity: 0.25 };
}
