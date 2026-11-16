/**
 * Disposition « Famille » (vue globale) : la racine au centre de son réseau,
 * les ancêtres au-dessus, les descendants en dessous, frères et sœurs sur la
 * même ligne, conjoints accolés. Les cousins se lisent naturellement : ils
 * descendent d'un même ancêtre placé au-dessus.
 *
 * Principe : on calcule d'abord la génération de chaque personne par rapport à
 * la racine (ancêtres > 0, descendants < 0, conjoints au même niveau). Puis on
 * range les « unités » (un couple et ses enfants) comme un arbre : chaque unité
 * reçoit une largeur, ses enfants sont centrés dessous. Une personne n'apparaît
 * qu'une fois.
 */

export const CARD_W = 208;
export const CARD_H = 64;
const H_GAP = 36; // entre deux unités (frères, cousins)
const M_GAP = 20; // entre deux membres d'un même couple
const ROW_H = 150; // hauteur d'une génération
const PAD = 40;

/** Génération de chaque personne par rapport à la racine (racine = 0). */
export function computeLevels(graph, rootId, { up = 6, down = 3, showSiblings = true } = {}) {
  const levels = new Map([[rootId, 0]]);
  // Conjoints ajoutés pour l'affichage : leur famille d'origine (parents, frères et sœurs) n'est pas montrée.
  const asSpouse = new Set();
  const queue = [rootId];
  while (queue.length) {
    const id = queue.shift();
    const level = levels.get(id);
    const isSpouse = asSpouse.has(id);
    if (!isSpouse && level < up) {
      for (const link of graph.getParents(id)) {
        if (!levels.has(link.parentId)) {
          levels.set(link.parentId, level + 1);
          queue.push(link.parentId);
        }
      }
    }
    // Descendants : un conjoint n'apporte que ses enfants communs avec la racine (niveau 0).
    const canDescend = isSpouse ? level === 0 : level > -down && (level <= 0 || showSiblings);
    if (canDescend && level > -down) {
      for (const childId of graph.getChildren(id)) {
        if (!levels.has(childId)) {
          levels.set(childId, level - 1);
          queue.push(childId);
        }
      }
    }
    // Conjoints (y compris ceux des conjoints, pour la chaîne) : même niveau.
    for (const spouseId of graph.getSpouses(id)) {
      if (!levels.has(spouseId)) {
        levels.set(spouseId, level);
        asSpouse.add(spouseId);
        queue.push(spouseId);
      }
    }
  }
  return levels;
}

function byBirth(graph) {
  const key = (id) => graph.getIndividual(id)?.birthDate || '9999-12-31';
  return (a, b) => (key(a) < key(b) ? -1 : key(a) > key(b) ? 1 : 0);
}

/**
 * Renvoie { nodes, couples, links, bounds } en pixels, ou null si la racine est inconnue.
 * - nodes : [{ id, x, y }] (x = centre de la carte, y = haut de la carte)
 * - couples : [{ x1, x2, y }] lignes horizontales entre conjoints
 * - links : [{ childId, parentIds, x1, y1, x2, y2 }] de l'union (ou du parent) vers l'enfant
 * - bounds : { minX, minY, maxX, maxY } pour ajuster la vue
 */
export function buildFamilyLayout(graph, rootId, opts = {}) {
  if (!graph || !graph.getIndividual(rootId)) return null;
  const levels = computeLevels(graph, rootId, opts);
  const inTree = (id) => levels.has(id);
  const placed = new Set();
  const sortKids = byBirth(graph);

  // Conjoints non encore placés, avec leur statut (une personne peut en avoir plusieurs).
  function unplacedPartners(id) {
    const out = [];
    for (const u of graph.getUnions(id)) {
      for (const q of u.partnerIds || []) {
        if (q !== id && inTree(q) && !placed.has(q) && !out.some((o) => o.q === q)) {
          out.push({ q, current: !['divorced', 'separated'].includes(u.status), startDate: u.startDate || '' });
        }
      }
    }
    return out;
  }

  // Un conjoint et ses propres conjoints, placés en chaîne vers l'extérieur.
  function claimChain(q) {
    placed.add(q);
    const chain = [q];
    for (const next of unplacedPartners(q)) {
      if (!placed.has(next.q)) chain.push(...claimChain(next.q));
    }
    return chain;
  }

  // Rangée d'une personne : le ou les conjoints actuels sont à droite, le plus proche en premier ;
  // les anciens conjoints sont à gauche, du plus récent (le plus proche) au plus ancien.
  // Une union sans date passe après les unions datées.
  function partnerRow(personId) {
    const options = unplacedPartners(personId);
    const current = options.filter((o) => o.current);
    const former = options.filter((o) => !o.current).sort((a, b) => (b.startDate < a.startDate ? -1 : b.startDate > a.startDate ? 1 : 0));
    const right = [];
    const left = [];
    for (const o of current) {
      if (!placed.has(o.q)) right.push(claimChain(o.q));
    }
    for (const o of former) {
      if (!placed.has(o.q)) left.push(claimChain(o.q));
    }
    // À gauche : le plus éloigné en premier ; dans chaque chaîne, le conjoint direct est le plus proche.
    const leftRow = left.slice().reverse().flatMap((chain) => chain.slice().reverse());
    return [...leftRow, personId, ...right.flat()];
  }

  // Unité = membres (une personne et ses conjoints) + enfants (unités à leur tour).
  function buildUnit(personId) {
    placed.add(personId);
    const members = partnerRow(personId);
    const kids = [];
    for (const m of members) {
      for (const c of graph.getChildren(m)) {
        if (inTree(c) && !placed.has(c) && !kids.includes(c)) kids.push(c);
      }
    }
    kids.sort(sortKids);
    const children = [];
    for (const c of kids) {
      if (!placed.has(c)) children.push(buildUnit(c));
    }
    // Frères et sœurs plus âgés que la racine : leurs conjoints se placent à l'extérieur
    // (à gauche de la personne), la racine garde son conjoint à droite.
    const rootIdx = children.findIndex((u) => u.members.includes(rootId));
    if (rootIdx > 0) children.slice(0, rootIdx).forEach(setOutward);
    return { members, children, level: levels.get(personId) };
  }

  // Inverse l'ordre des membres d'une unité (et de ses descendants) : le conjoint passe à gauche.
  function setOutward(unit) {
    unit.members.reverse();
    unit.children.forEach(setOutward);
  }

  function ownWidth(unit) {
    return unit.members.length * CARD_W + (unit.members.length - 1) * M_GAP;
  }

  // Largeur : le plus large entre le couple et la somme de ses enfants.
  function measure(unit) {
    const own = ownWidth(unit);
    unit.children.forEach(measure);
    const kidsTotal = unit.children.reduce((s, c) => s + c.width, 0) + H_GAP * Math.max(0, unit.children.length - 1);
    unit.width = Math.max(own, kidsTotal);
  }

  // Position : enfants centrés sous l'unité, unité centrée sur ses enfants.
  function position(unit, left) {
    const own = ownWidth(unit);
    if (unit.children.length) {
      const kidsTotal = unit.children.reduce((s, c) => s + c.width, 0) + H_GAP * (unit.children.length - 1);
      let x = left + (unit.width - kidsTotal) / 2;
      for (const c of unit.children) {
        position(c, x);
        x += c.width + H_GAP;
      }
      const first = unit.children[0].cx;
      const last = unit.children[unit.children.length - 1].cx;
      unit.cx = (first + last) / 2;
    } else {
      unit.cx = left + unit.width / 2;
    }
    unit.memberX = unit.members.map((_, i) => unit.cx - own / 2 + CARD_W / 2 + i * (CARD_W + M_GAP));
  }

  // Racines de la forêt : personnes de l'arbre sans parent dans l'arbre, les plus anciennes générations en premier.
  const hasParentInTree = (id) => graph.getParents(id).some((l) => inTree(l.parentId));
  const tops = [...levels.keys()]
    .filter((id) => !hasParentInTree(id))
    .sort((a, b) => (levels.get(b) - levels.get(a)) || sortKids(a, b));

  const forest = [];
  for (const id of tops) {
    if (!placed.has(id)) forest.push(buildUnit(id));
  }
  // Filet de sécurité : toute personne restée hors forêt devient sa propre unité.
  for (const id of levels.keys()) {
    if (!placed.has(id)) forest.push(buildUnit(id));
  }

  let left = PAD;
  for (const unit of forest) {
    measure(unit);
    position(unit, left);
    left += unit.width + H_GAP * 2;
  }

  const maxLevel = Math.max(...levels.values());
  const rowY = (level) => PAD + (maxLevel - level) * ROW_H;

  const nodes = [];
  const couples = [];
  function emit(unit) {
    const y = rowY(unit.level);
    unit.members.forEach((id, i) => nodes.push({ id, x: unit.memberX[i], y }));
    // Une ligne par union entre deux membres voisins : pas de trait pour un lien qui n'existe pas.
    for (let i = 0; i < unit.members.length - 1; i++) {
      const a = unit.members[i];
      const b = unit.members[i + 1];
      const union = graph.getUnions(a).find((u) => (u.partnerIds || []).includes(b));
      if (!union) continue;
      couples.push({
        x1: unit.memberX[i] + CARD_W / 2,
        x2: unit.memberX[i + 1] - CARD_W / 2,
        y: y + CARD_H / 2,
        unionId: union.id,
        unionType: union.unionType || null,
        status: union.status || null,
      });
    }
    unit.children.forEach(emit);
  }
  forest.forEach(emit);

  // Liens : un trait par couple (parent, enfant) réel, du bas de la carte du parent
  // vers le haut de la carte de l'enfant. Un enfant n'est jamais relié à un parent
  // qui n'est pas le sien, même s'il est placé à côté.
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const links = [];
  for (const child of nodes) {
    const seen = new Set();
    for (const link of graph.getParents(child.id)) {
      const parent = byId.get(link.parentId);
      if (!parent || seen.has(link.parentId)) continue;
      seen.add(link.parentId);
      links.push({
        childId: child.id,
        parentId: link.parentId,
        x1: parent.x,
        y1: parent.y + CARD_H,
        x2: child.x,
        y2: child.y,
      });
    }
  }

  // Unions dont les deux conjoints sont dans l'arbre mais non voisins : tracées en arc
  // sous la rangée, pour qu'aucune union enregistrée n'échappe à l'affichage.
  const drawnUnions = new Set(couples.map((c) => c.unionId));
  const arcs = [];
  // Chaque union sous une même rangée reçoit sa propre voie, pour ne pas se superposer.
  const lanesPerRow = new Map();
  for (const union of graph.unions.values()) {
    if (drawnUnions.has(union.id)) continue;
    const present = (union.partnerIds || []).filter((id) => byId.has(id));
    for (let i = 0; i + 1 < present.length; i++) {
      const a = byId.get(present[i]);
      const b = byId.get(present[i + 1]);
      const rowKey = Math.max(a.y, b.y);
      const lane = lanesPerRow.get(rowKey) || 0;
      lanesPerRow.set(rowKey, lane + 1);
      arcs.push({
        lane,
        unionId: union.id,
        unionType: union.unionType || null,
        status: union.status || null,
        ...sideAnchors(a, b),
      });
    }
  }

  // Point d'attache d'une union sur la carte : côté qui fait face à l'autre conjoint.
  // Les coordonnées des nœuds sont le centre de la carte : les bords sont à ± CARD_W / 2.
  function sideAnchors(a, b) {
    const midY = (n) => n.y + CARD_H / 2;
    if (b.x > a.x) return { ax: a.x + CARD_W / 2, ay: midY(a), bx: b.x - CARD_W / 2, by: midY(b) };
    return { ax: a.x - CARD_W / 2, ay: midY(a), bx: b.x + CARD_W / 2, by: midY(b) };
  }
  const xs = nodes.map((n) => n.x);
  const ys = nodes.map((n) => n.y);
  const bounds = {
    minX: Math.min(...xs) - CARD_W / 2 - PAD,
    maxX: Math.max(...xs) + CARD_W / 2 + PAD,
    minY: Math.min(...ys) - PAD,
    maxY: Math.max(...ys) + CARD_H + PAD,
  };
  return { nodes, couples, links, arcs, bounds };
}
