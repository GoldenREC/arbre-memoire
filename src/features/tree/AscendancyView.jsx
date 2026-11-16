import { useLayoutEffect, useMemo, useRef } from 'react';
import { useFamilyTree } from './FamilyTreeContext.jsx';
import { buildPedigree } from './buildPedigree.js';
import PersonCard from './PersonCard.jsx';
import TreeConnectorsOverlay, { useNodeRefs } from './TreeConnectors.jsx';

const GENERATION_LABELS = ['Racine', 'Parents', 'Grands-parents', 'Arrière-grands-parents', '4e génération', '5e génération', '6e génération'];

const CARD_HEIGHT = 64; // px, doit rester cohérent avec la taille réelle de PersonCard
const CARD_WIDTH = 224; // px, idem (w-52 + espacement) — utilisé en orientation verticale

export default function AscendancyView({ onOpenIndividual }) {
  const { graph, rootId, setRootId, generations, orientation } = useFamilyTree();
  const isBottomUp = orientation === 'bottomUp';
  const containerRef = useRef(null);
  const { refsMap, register } = useNodeRefs();
  const isVertical = orientation === 'vertical' || isBottomUp;

  const { nodesBySlot, edges } = useMemo(
    () => buildPedigree(graph, rootId, generations),
    [graph, rootId, generations]
  );

  const columns = useMemo(() => {
    const cols = [];
    for (let gen = 0; gen <= generations; gen++) {
      const slots = 2 ** gen;
      const nodes = [];
      for (let i = 0; i < slots; i++) {
        nodes.push(nodesBySlot.get(`${gen}:${i}`) || { slotKey: `${gen}:${i}`, individual: null });
      }
      cols.push(nodes);
    }
    return cols;
  }, [nodesBySlot, generations]);

  // Horizontal (par défaut) : une génération = une colonne, les
  // individus s'empilent verticalement — la largeur totale importe peu,
  // la hauteur doit en revanche accueillir la colonne la plus chargée.
  // Vertical : une génération = une ligne, les individus se répartissent
  // horizontalement — c'est l'inverse.
  // Racine en bas : on remonte les générations vers le haut. Le tracé part
  // donc du parent (au-dessus) vers l'enfant (en dessous).
  const drawnEdges = useMemo(
    () => (isBottomUp ? edges.map((e) => ({ from: e.to, to: e.from })) : edges),
    [edges, isBottomUp]
  );

  // Racine en bas : on démarre le défilement en bas, là où se trouve la racine.
  useLayoutEffect(() => {
    if (isBottomUp && containerRef.current) containerRef.current.scrollTop = containerRef.current.scrollHeight;
  }, [isBottomUp, rootId, generations]);

  const sizingStyle = isVertical
    ? { minWidth: 2 ** generations * CARD_WIDTH }
    : { minHeight: 2 ** generations * CARD_HEIGHT };

  return (
    <div className="flex h-full flex-col">
      <p className="mb-3 text-xs text-neutral-400">
        {isBottomUp
          ? 'Racine en bas : les parents sont au-dessus, puis les grands-parents. Clique sur une carte pour la centrer, 🔍 pour sa fiche.'
          : "Survole une carte pour centrer l'arbre sur cette personne (⌖) ou ouvrir sa fiche (🔍)."}
      </p>
      <div ref={containerRef} className="relative flex-1 overflow-auto rounded-xl border border-neutral-200 p-6 dark:border-neutral-800">
        <div className={`relative flex gap-12 ${isVertical ? (isBottomUp ? 'flex-col-reverse' : 'flex-col') : ''}`} style={sizingStyle}>
          <TreeConnectorsOverlay containerRef={containerRef} refsMap={refsMap} edges={drawnEdges} direction={isVertical ? 'vertical' : 'horizontal'} />

          {columns.map((nodes, gen) => (
            <div key={gen} className={isVertical ? 'flex shrink-0 flex-row items-center gap-4' : 'flex w-52 shrink-0 flex-col'}>
              <div
                className={
                  isVertical
                    ? 'w-36 shrink-0 text-right text-xs font-medium uppercase tracking-wide text-neutral-400'
                    : 'mb-2 text-center text-xs font-medium uppercase tracking-wide text-neutral-400'
                }
              >
                {GENERATION_LABELS[gen] || `${gen}e génération`}
              </div>
              <div className={isVertical ? 'flex flex-1 flex-row justify-around gap-2' : 'flex flex-1 flex-col justify-around gap-2'}>
                {nodes.map((node) => (
                  <div key={node.slotKey} ref={register(node.slotKey)} className="flex justify-center">
                    <PersonCard
                      individual={node.individual}
                      highlighted={node.individualId === rootId}
                      onCenter={setRootId}
                      onOpen={onOpenIndividual}
                    />
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
