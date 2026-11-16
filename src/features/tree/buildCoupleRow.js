/**
 * Disposition « Couples » : une ligne de personnes centrée sur la racine.
 * Chaque conjoint est placé à côté de la personne qui l'a amené, du côté
 * opposé à la racine : Eva – Gilles – Laetitia – Christophe – Maritza pour
 * le point de vue de Gilles. Les unions sont triées par date de début ; les
 * unions sans date passent après les datées.
 *
 * Limites volontaires : une personne n'a qu'un prolongement par côté (son
 * premier conjoint non encore placé) ; un enfant n'apparaît qu'une fois.
 */

const NO_DATE = '￿';

function sortUnions(unions) {
  return [...unions].sort((a, b) => {
    const da = a.startDate || NO_DATE;
    const db = b.startDate || NO_DATE;
    return da < db ? -1 : da > db ? 1 : 0;
  });
}

function partnerOf(graph, union, personId) {
  return (union.partnerIds || []).find((id) => id !== personId) || null;
}

/**
 * Renvoie { row, couples, groups } ou null si la racine est inconnue.
 * - row : [{ personId }] de gauche à droite, racine incluse.
 * - couples : [{ unionId, status, startDate, leftId, rightId }] entre voisins.
 * - groups : [{ key, unionId|null, parentIds, children: [{ childId, filiationType }] }].
 */
export function buildCoupleRow(graph, rootId) {
  if (!graph || !graph.getIndividual(rootId)) return null;

  const placed = new Set([rootId]);

  // Prolonge une chaîne à partir de `personId`, du côté « extérieur » seulement.
  function extendOutward(personId, sideEntries, couples) {
    let current = personId;
    for (;;) {
      const candidates = sortUnions(graph.getUnions(current).filter(Boolean));
      const next = candidates.find((u) => {
        const p = partnerOf(graph, u, current);
        return p && !placed.has(p);
      });
      if (!next) return;
      const partnerId = partnerOf(graph, next, current);
      placed.add(partnerId);
      sideEntries.push(partnerId);
      couples.push({ unionId: next.id, status: next.status, startDate: next.startDate, innerId: current, outerId: partnerId });
      current = partnerId;
    }
  }

  // Unions directes de la racine, triées par date : la première moitié à
  // gauche (la plus ancienne en bout de chaîne), le reste à droite.
  const rootUnions = sortUnions(graph.getUnions(rootId).filter(Boolean)).filter((u) => {
    const p = partnerOf(graph, u, rootId);
    return p && !placed.has(p);
  });
  const splitAt = Math.ceil(rootUnions.length / 2);
  const leftUnions = rootUnions.slice(0, splitAt).reverse(); // le plus récent est le plus proche
  const rightUnions = rootUnions.slice(splitAt);

  const leftSide = []; // ordre : du plus proche de la racine vers l'extérieur
  const rightSide = [];
  const couples = [];

  for (const union of leftUnions) {
    const partnerId = partnerOf(graph, union, rootId);
    if (!partnerId || placed.has(partnerId)) continue;
    placed.add(partnerId);
    leftSide.push(partnerId);
    couples.push({ unionId: union.id, status: union.status, startDate: union.startDate, innerId: rootId, outerId: partnerId });
    extendOutward(partnerId, leftSide, couples);
  }
  for (const union of rightUnions) {
    const partnerId = partnerOf(graph, union, rootId);
    if (!partnerId || placed.has(partnerId)) continue;
    placed.add(partnerId);
    rightSide.push(partnerId);
    couples.push({ unionId: union.id, status: union.status, startDate: union.startDate, innerId: rootId, outerId: partnerId });
    extendOutward(partnerId, rightSide, couples);
  }

  // Ordre visuel : côté gauche inversé (le plus extérieur d'abord), racine, côté droit.
  const row = [...leftSide.reverse(), rootId, ...rightSide].map((personId) => ({ personId }));

  // Enfants : rattachés à l'union de leur lien, sinon au parent seul.
  const groups = new Map();
  const shownChildren = new Set();
  const coupleIds = new Set(couples.map((c) => c.unionId));

  function groupFor(key, unionId, parentIds) {
    if (!groups.has(key)) groups.set(key, { key, unionId, parentIds, children: [] });
    return groups.get(key);
  }

  for (const { personId } of row) {
    for (const childId of graph.getChildren(personId)) {
      if (shownChildren.has(childId)) continue;
      const links = graph.getParents(childId).filter((l) => l.parentId === personId);
      const unionLink = links.find((l) => l.unionId && coupleIds.has(l.unionId));
      if (unionLink) {
        const c = couples.find((x) => x.unionId === unionLink.unionId);
        groupFor(`u:${c.unionId}`, c.unionId, [c.innerId, c.outerId]).children.push({ childId, filiationType: unionLink.filiationType });
        shownChildren.add(childId);
      }
    }
  }
  for (const { personId } of row) {
    for (const childId of graph.getChildren(personId)) {
      if (shownChildren.has(childId)) continue;
      const link = graph.getParents(childId).find((l) => l.parentId === personId);
      groupFor(`p:${personId}`, null, [personId]).children.push({ childId, filiationType: link?.filiationType || 'unknown' });
      shownChildren.add(childId);
    }
  }

  return { row, couples, groups: [...groups.values()] };
}
