/**
 * Construit la structure d'un arbre d'ascendance (pedigree chart) :
 * un individu racine occupe le slot (génération 0, index 0) ; ses deux
 * parents occupent les slots (1, 0) et (1, 1) ; plus généralement
 * l'individu au slot (g, i) a pour parents (g+1, 2i) et (g+1, 2i+1).
 * Ce même adressage binaire est réutilisé par la vue Éventail
 * (computeFanSegments) — c'est ce qui rend les deux vues cohérentes
 * entre elles pour un même individu racine.
 *
 * Gère les branches manquantes (noeud avec individual=null) et les
 * mariages multiples (voir pickPedigreeParents : on retient une seule
 * paire "père/mère" par individu — un raffinement permettant de choisir
 * explicitement la lignée pourra être ajouté depuis la fiche individu).
 */

export function pickPedigreeParents(graph, individualId) {
  const links = graph.getParents(individualId);
  if (links.length === 0) return [null, null];

  // Priorité aux filiations biologiques quand plusieurs sont connues.
  const sorted = [...links].sort((a, b) => {
    const score = (l) => (l.filiationType === 'biological' ? 0 : 1);
    return score(a) - score(b);
  });

  const withSex = sorted.map((l) => ({ ...l, sex: graph.getIndividual(l.parentId)?.sex }));
  const father = withSex.find((p) => p.sex === 'M') || withSex[0] || null;
  const mother = withSex.find((p) => p.sex === 'F' && p !== father) || withSex.find((p) => p !== father) || null;

  return [father?.parentId ?? null, mother?.parentId ?? null];
}

export function buildPedigree(graph, rootId, maxGenerations) {
  const nodesBySlot = new Map();
  const edges = [];
  if (!graph || !rootId) return { nodesBySlot, edges };

  function visit(individualId, generation, slotIndex) {
    const slotKey = `${generation}:${slotIndex}`;
    const individual = individualId ? graph.getIndividual(individualId) : null;
    nodesBySlot.set(slotKey, { slotKey, generation, slotIndex, individual, individualId });

    if (generation >= maxGenerations || !individualId) return;

    const [fatherId, motherId] = pickPedigreeParents(graph, individualId);
    const fatherSlot = `${generation + 1}:${slotIndex * 2}`;
    const motherSlot = `${generation + 1}:${slotIndex * 2 + 1}`;

    edges.push({ from: slotKey, to: fatherSlot });
    edges.push({ from: slotKey, to: motherSlot });

    visit(fatherId, generation + 1, slotIndex * 2);
    visit(motherId, generation + 1, slotIndex * 2 + 1);
  }

  visit(rootId, 0, 0);
  return { nodesBySlot, edges };
}
