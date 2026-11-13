import { useMemo, useRef } from 'react';
import { useFamilyTree } from './FamilyTreeContext.jsx';
import { buildPedigree } from './buildPedigree.js';
import PersonCard from './PersonCard.jsx';
import TreeConnectorsOverlay, { useNodeRefs } from './TreeConnectors.jsx';

const GENERATION_LABELS = ['Racine', 'Parents', 'Grands-parents', 'Arrière-grands-parents', '4e génération', '5e génération', '6e génération'];

const CARD_HEIGHT = 64; // px, doit rester cohérent avec la taille réelle de PersonCard

export default function AscendancyView({ onOpenIndividual }) {
  const { graph, rootId, setRootId, generations } = useFamilyTree();
  const containerRef = useRef(null);
  const { refsMap, register } = useNodeRefs();

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

  const minHeight = 2 ** generations * CARD_HEIGHT;

  return (
    <div className="flex h-full flex-col">
      <p className="mb-3 text-xs text-neutral-400">
        Survole une carte pour centrer l'arbre sur cette personne (⌖) ou ouvrir sa fiche (🔍).
      </p>
      <div ref={containerRef} className="relative flex-1 overflow-auto rounded-xl border border-neutral-200 p-6 dark:border-neutral-800">
        <div className="relative flex gap-12" style={{ minHeight }}>
          <TreeConnectorsOverlay containerRef={containerRef} refsMap={refsMap} edges={edges} direction="horizontal" />

          {columns.map((nodes, gen) => (
            <div key={gen} className="flex w-52 shrink-0 flex-col">
              <div className="mb-2 text-center text-xs font-medium uppercase tracking-wide text-neutral-400">
                {GENERATION_LABELS[gen] || `${gen}e génération`}
              </div>
              <div className="flex flex-1 flex-col justify-around gap-2">
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
