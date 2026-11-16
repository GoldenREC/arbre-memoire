import { useMemo, useRef } from 'react';
import { useFamilyTree } from './FamilyTreeContext.jsx';
import { buildCoupleRow } from './buildCoupleRow.js';
import PersonCard from './PersonCard.jsx';
import TreeConnectorsOverlay, { useNodeRefs } from './TreeConnectors.jsx';

// Style des liens enfant/parent selon le type (aligné sur FILIATION_LABELS).
const FILIATION_STYLE = {
  biological: { color: '#15803d' },
  adoption_plenary: { color: '#2563eb', dash: '6 4' },
  adoption_simple: { color: '#7c3aed', dash: '6 4' },
  foster: { color: '#ea580c', dash: '6 4' },
  late_recognition: { color: '#ca8a04', dash: '6 4' },
  abandoned: { color: '#dc2626', dash: '2 3' },
  unknown: { color: '#dc2626', dash: '2 3' },
};

// Style du couple selon le statut de l'union.
function coupleStyle(status) {
  if (status === 'divorced') return { color: '#a3a3a3', dash: '4 4' };
  if (status === 'widowed' || status === 'annulled') return { color: '#a3a3a3' };
  return { color: '#737373' };
}

function unionYear(date) {
  return date ? date.slice(0, 4) : '';
}

/**
 * Vue « Couples » : une ligne de personnes centrée sur la racine, les unions
 * entre voisins (trait plein = en couple, pointillés gris = divorcé), les
 * enfants en dessous, reliés à leur union par un tiret de couleur selon le
 * type de lien.
 */
export default function CoupleView({ onOpenIndividual }) {
  const { graph, rootId, setRootId } = useFamilyTree();
  const containerRef = useRef(null);
  const { refsMap, register } = useNodeRefs();

  const layout = useMemo(() => buildCoupleRow(graph, rootId), [graph, rootId]);

  if (!layout) {
    return <p className="text-sm text-neutral-400">Aucun individu sélectionné.</p>;
  }

  const coupleByUnion = new Map(layout.couples.map((c) => [c.unionId, c]));
  const horizontalEdges = [];
  for (const c of layout.couples) {
    const style = coupleStyle(c.status);
    horizontalEdges.push({ from: `p:${c.innerId}`, to: `u:${c.unionId}`, style });
    horizontalEdges.push({ from: `u:${c.unionId}`, to: `p:${c.outerId}`, style });
  }
  // Un couple dont un des conjoints n'est pas voisin ne porte pas de trait.
  const verticalEdges = [];
  for (const g of layout.groups) {
    for (const child of g.children) {
      const anchor = g.unionId ? `u:${g.unionId}` : `p:${g.parentIds[0]}`;
      verticalEdges.push({ from: anchor, to: `k:${child.childId}`, style: FILIATION_STYLE[child.filiationType] || FILIATION_STYLE.unknown });
    }
  }

  return (
    <div ref={containerRef} className="relative overflow-auto rounded-xl border border-neutral-200 p-6 dark:border-neutral-800">
      <p className="mb-4 text-xs text-neutral-400">
        Trait plein : en couple · pointillés gris : divorcés. Tirets de couleur : types de lien (biologique en vert, adoption en bleu ou violet, famille d'accueil en orange, reconnaissance en jaune, non déclaré ou abandonné en rouge).
      </p>

      <div className="relative flex items-center gap-0">
        {layout.row.map(({ personId }, index) => {
          const couple = index < layout.row.length - 1 ? layout.couples.find((c) => (c.innerId === personId && c.outerId === layout.row[index + 1].personId) || (c.outerId === personId && c.innerId === layout.row[index + 1].personId)) : null;
          return (
            <div key={personId} className="flex items-center">
              <div ref={register(`p:${personId}`)} className="shrink-0">
                <PersonCard
                  individual={graph.getIndividual(personId)}
                  highlighted={personId === rootId}
                  onCenter={setRootId}
                  onOpen={onOpenIndividual}
                />
              </div>
              {couple && (
                <div ref={register(`u:${couple.unionId}`)} className="flex w-16 shrink-0 flex-col items-center text-[10px] text-neutral-400">
                  <span>{unionYear(couple.startDate)}</span>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {layout.groups.length > 0 && (
        <div className="mt-10 flex flex-wrap gap-8">
          {layout.groups.map((g) => (
            <div key={g.key} className="flex flex-wrap gap-3">
              {g.children.map((child) => (
                <div key={child.childId} ref={register(`k:${child.childId}`)} className="shrink-0">
                  <PersonCard
                    individual={graph.getIndividual(child.childId)}
                    onCenter={setRootId}
                    onOpen={onOpenIndividual}
                  />
                </div>
              ))}
            </div>
          ))}
        </div>
      )}

      <TreeConnectorsOverlay containerRef={containerRef} refsMap={refsMap} edges={horizontalEdges} direction="horizontal" />
      <TreeConnectorsOverlay containerRef={containerRef} refsMap={refsMap} edges={verticalEdges} direction="vertical" />
    </div>
  );
}
