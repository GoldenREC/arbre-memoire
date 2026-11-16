import { useMemo } from 'react';
import { useFamilyTree } from './FamilyTreeContext.jsx';
import { buildFamilyLayout, CARD_H, CARD_W } from './buildFamilyLayout.js';
import { linkStyle } from './filiationStyle.js';
import PersonCard from './PersonCard.jsx';
import TreeCanvas from './TreeCanvas.jsx';

/**
 * Vue « Famille » : la racine au centre de son réseau (ancêtres au-dessus,
 * descendants en dessous, frères et sœurs et cousins lisibles), zoom et
 * déplacement. Les traits de couleur indiquent le type de lien parent/enfant.
 */
export default function FamilyChartView({ onOpenIndividual }) {
  const { graph, rootId, setRootId, generations, setGenerations, showSiblings, setShowSiblings } = useFamilyTree();
  const layout = useMemo(
    () => buildFamilyLayout(graph, rootId, { up: generations, down: 3, showSiblings }),
    [graph, rootId, generations, showSiblings]
  );

  if (!layout) {
    return <p className="text-sm text-neutral-400">Aucun individu sélectionné.</p>;
  }

  const { nodes, couples, links, bounds } = layout;
  const width = bounds.maxX - bounds.minX;
  const height = bounds.maxY - bounds.minY;

  return (
    <div className="flex h-full flex-col">
      <div className="mb-3 flex flex-wrap items-center gap-3 text-xs text-neutral-500 dark:text-neutral-400">
        <span>Générations au-dessus :</span>
        <div className="flex gap-1">
          {[2, 3, 4, 5, 6].map((n) => (
            <button
              key={n}
              onClick={() => setGenerations(n)}
              className={`h-7 w-7 rounded-md ${generations === n ? 'bg-accent-600 text-white' : 'bg-neutral-100 hover:bg-neutral-200 dark:bg-neutral-800 dark:hover:bg-neutral-700'}`}
            >
              {n}
            </button>
          ))}
        </div>
        <button
          onClick={() => setShowSiblings(!showSiblings)}
          className={`rounded-md px-2.5 py-1 ${showSiblings ? 'bg-accent-600 text-white' : 'bg-neutral-100 hover:bg-neutral-200 dark:bg-neutral-800 dark:hover:bg-neutral-700'}`}
        >
          {showSiblings ? 'Masquer les frères et sœurs' : 'Voir les frères et sœurs'}
        </button>
        <span className="ml-auto hidden lg:inline">Molette : zoom · glisser : déplacer · clic sur une carte : la centrer</span>
      </div>
      <TreeCanvas bounds={bounds} fitKey={`${rootId}-${generations}-${showSiblings}`} height="70vh">
        <div className="relative" style={{ width, height }}>
          <svg className="pointer-events-none absolute left-0 top-0 overflow-visible" width={width} height={height} style={{ transform: `translate(${-bounds.minX}px, ${-bounds.minY}px)` }}>
            {couples.map((c, i) => (
              <line key={`c${i}`} x1={c.x1} y1={c.y} x2={c.x2} y2={c.y} stroke="#737373" strokeWidth={1.5} />
            ))}
            {links.map((l, i) => {
              const style = linkStyle(graph, l.childId, l.parentIds);
              const ym = (l.y1 + l.y2) / 2;
              return (
                <path
                  key={`l${i}`}
                  d={`M ${l.x1} ${l.y1} C ${l.x1} ${ym}, ${l.x2} ${ym}, ${l.x2} ${l.y2}`}
                  fill="none"
                  stroke={style.color}
                  strokeWidth={1.5}
                  strokeDasharray={style.dash}
                />
              );
            })}
          </svg>
          {nodes.map((n) => (
            <div key={n.id} className="absolute" style={{ left: n.x - CARD_W / 2, top: n.y, width: CARD_W, height: CARD_H }}>
              <PersonCard
                individual={graph.getIndividual(n.id)}
                highlighted={n.id === rootId}
                onCenter={setRootId}
                onOpen={onOpenIndividual}
              />
            </div>
          ))}
        </div>
      </TreeCanvas>
    </div>
  );
}
