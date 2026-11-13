/**
 * Construit récursivement l'arbre de descendance d'un individu, en
 * regroupant ses enfants par union (pour afficher "⚭ avec X" avant
 * chaque fratrie) — utile dès qu'il y a eu plusieurs mariages. Le
 * repliement (collapsed) stoppe la récursion sur un noeud donné sans
 * perdre l'information qu'il a des enfants (hasChildren reste vrai).
 */
export function buildDescendantTree(graph, rootId, { collapsed = new Set(), visited = new Set() } = {}) {
  if (!graph || !rootId || visited.has(rootId)) return null;
  visited.add(rootId);

  const individual = graph.getIndividual(rootId);
  const childIds = graph.getChildren(rootId);
  const isCollapsed = collapsed.has(rootId);

  const groups = new Map(); // unionId|'none' -> { union, partnerId, childIds: [] }
  for (const childId of childIds) {
    const link = graph.getParents(childId).find((l) => l.parentId === rootId);
    const unionKey = link?.unionId || 'none';
    if (!groups.has(unionKey)) {
      const union = link?.unionId ? graph.unions.get(link.unionId) : null;
      const partnerId = union?.partnerIds.find((id) => id !== rootId) ?? null;
      groups.set(unionKey, { union, partnerId, childIds: [] });
    }
    groups.get(unionKey).childIds.push(childId);
  }

  const familyGroups = [...groups.values()].map((g) => ({
    union: g.union,
    partner: g.partnerId ? graph.getIndividual(g.partnerId) : null,
    children: isCollapsed
      ? []
      : g.childIds
          .map((cid) => buildDescendantTree(graph, cid, { collapsed, visited }))
          .filter(Boolean),
  }));

  return {
    individualId: rootId,
    individual,
    hasChildren: childIds.length > 0,
    isCollapsed,
    familyGroups,
  };
}
