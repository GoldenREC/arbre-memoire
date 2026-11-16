import { useMemo, useState } from 'react';
import { useFamilyTree } from './FamilyTreeContext.jsx';

import { buildFamilyLayout, CARD_H, CARD_W } from './buildFamilyLayout.js';
import { linkStyle, unionStyle } from './filiationStyle.js';
import { linkLook, linkPaths } from './familyBuses.js';
import PersonCard from './PersonCard.jsx';
import TreeCanvas from './TreeCanvas.jsx';
import TreeLegend from './TreeLegend.jsx';

/**
 * Vue « Famille » : la racine au centre de son réseau (ancêtres au-dessus,
 * descendants en dessous, frères et sœurs et cousins lisibles), zoom et
 * déplacement. Les traits de couleur indiquent le type de lien parent/enfant.
 */
export default function FamilyChartView({ onOpenIndividual }) {
  const { graph, rootId, setRootId, generations, setGenerations, showSiblings, setShowSiblings } = useFamilyTree();
  const [focusId, setFocusId] = useState(null);
  const layout = useMemo(
    () => buildFamilyLayout(graph, rootId, { up: generations, down: 3, showSiblings }),
    [graph, rootId, generations, showSiblings]
  );

  if (!layout) {
    return <p className="text-sm text-neutral-400">Aucun individu sélectionné.</p>;
  }

  const { nodes, couples, links, arcs, bounds } = layout;
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
      </div>
      <TreeCanvas bounds={bounds} fitKey={`${rootId}-${generations}-${showSiblings}`} height="62vh">
        <div className="relative" style={{ width, height }}>
          <svg className="pointer-events-none absolute left-0 top-0 overflow-visible" width={width} height={height} style={{ transform: `translate(${-bounds.minX}px, ${-bounds.minY}px)` }}>
            {couples.map((c, i) => {
              const u = unionStyle(c.status, c.unionType);
              return <line key={`c${i}`} x1={c.x1} y1={c.y} x2={c.x2} y2={c.y} stroke={u.color} strokeWidth={2.5} strokeDasharray={u.dash} />;
            })}
            {arcs.map((a, i) => {
              const u = unionStyle(a.status, a.unionType);
              // Tracé orthogonal : sort de la carte par le côté, descend sous la rangée, rentre par le côté du conjoint.
              const sA = a.bx > a.ax ? 1 : -1;
              const bus = Math.max(a.ay, a.by) + CARD_H / 2 + 22 + a.lane * 12;
              const x1 = a.ax + sA * 10;
              const x2 = a.bx - sA * 10;
              return (
                <path
                  key={`a${i}`}
                  d={`M ${a.ax} ${a.ay} L ${x1} ${a.ay} L ${x1} ${bus} L ${x2} ${bus} L ${x2} ${a.by} L ${a.bx} ${a.by}`}
                  fill="none"
                  stroke={u.color}
                  strokeWidth={2}
                  strokeLinejoin="round"
                  strokeDasharray={u.dash}
                />
              );
            })}
            {linkPaths(links).map((p, i) => {
              const style = linkStyle(graph, p.childId, [p.parentId]);
              const look = linkLook(p, focusId, style.color);
              return <path key={`l${i}`} d={p.d} fill="none" stroke={look.stroke} strokeWidth={look.strokeWidth} strokeOpacity={look.opacity} strokeDasharray={style.dash} />;
            })}
          </svg>
          {nodes.map((n) => (
            <div
              key={n.id}
              className="group absolute cursor-pointer"
              style={{ left: n.x - CARD_W / 2, top: n.y, width: CARD_W, height: CARD_H }}
              onMouseEnter={() => setFocusId(n.id)}
              onMouseLeave={() => setFocusId(null)}
              onDoubleClick={(e) => {
                if (e.target.closest?.('button')) return;
                setRootId(n.id);
              }}
              title="Survole une personne pour voir ses liens parentaux, double-clic pour la centrer"
            >
              <div className="absolute -top-6 left-1/2 flex -translate-x-1/2 gap-1 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
                <button
                  onPointerDown={(e) => e.stopPropagation()}
                  onClick={() => setRootId(n.id)}
                  className="rounded-md bg-white px-2 py-0.5 text-[11px] shadow-sm hover:bg-neutral-100 dark:bg-neutral-800 dark:hover:bg-neutral-700"
                  title="Centrer l'arbre sur cette personne"
                >
                  Centrer
                </button>
                <button
                  onPointerDown={(e) => e.stopPropagation()}
                  onClick={() => onOpenIndividual?.(n.id)}
                  className="rounded-md bg-white px-2 py-0.5 text-[11px] shadow-sm hover:bg-neutral-100 dark:bg-neutral-800 dark:hover:bg-neutral-700"
                  title="Ouvrir la fiche"
                >
                  Fiche
                </button>
              </div>
              <PersonCard individual={graph.getIndividual(n.id)} highlighted={n.id === rootId} />
            </div>
          ))}
        </div>
      </TreeCanvas>
      <TreeLegend />
    </div>
  );
}
