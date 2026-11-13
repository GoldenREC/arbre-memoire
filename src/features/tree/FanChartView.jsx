import { useEffect, useMemo, useRef, useState } from 'react';
import * as d3 from 'd3';
import { useFamilyTree } from './FamilyTreeContext.jsx';
import { buildPedigree } from './buildPedigree.js';
import { computeFanSegments } from './buildFanChart.js';
import { branchColor } from './branchColor.js';
import { formatGenealogyDate } from '../../lib/utils/dates.js';

const RING_WIDTH = 56;
const ROOT_RADIUS = 36;

/**
 * Vue Éventail : génération la plus proche au centre, ancêtres
 * lointains sur les cercles extérieurs. Les arcs sont générés par
 * d3.arc() ; le zoom/pan utilise d3.zoom() appliqué directement au
 * <g> via une ref (pas de re-render React à chaque tick, pour rester
 * fluide même avec beaucoup de segments).
 */
export default function FanChartView({ onOpenIndividual }) {
  const { graph, rootId, setRootId, generations } = useFamilyTree();
  const svgRef = useRef(null);
  const gRef = useRef(null);
  const containerRef = useRef(null);
  const [colorMode, setColorMode] = useState('branch'); // 'branch' | 'completeness'
  const [tooltip, setTooltip] = useState(null);

  const { nodesBySlot } = useMemo(() => buildPedigree(graph, rootId, generations), [graph, rootId, generations]);
  const segments = useMemo(() => computeFanSegments(nodesBySlot, generations), [nodesBySlot, generations]);
  const root = graph?.getIndividual(rootId) ?? null;

  const arcGenerator = useMemo(
    () =>
      d3
        .arc()
        .innerRadius((d) => ROOT_RADIUS + (d.generation - 1) * RING_WIDTH)
        .outerRadius((d) => ROOT_RADIUS + d.generation * RING_WIDTH)
        .startAngle((d) => d.startAngle)
        .endAngle((d) => d.endAngle)
        .padAngle(0.006)
        .padRadius(ROOT_RADIUS),
    []
  );

  const outerRadius = ROOT_RADIUS + generations * RING_WIDTH;
  const size = outerRadius * 2 + 40;

  useEffect(() => {
    if (!svgRef.current || !gRef.current) return undefined;
    const svg = d3.select(svgRef.current);
    const g = d3.select(gRef.current);
    const zoomBehavior = d3
      .zoom()
      .scaleExtent([0.5, 4])
      .on('zoom', (event) => g.attr('transform', event.transform));
    svg.call(zoomBehavior);
    return () => svg.on('.zoom', null);
  }, [size]);

  function colorFor(segment) {
    if (!segment.individual) return 'transparent';
    if (colorMode === 'completeness') {
      return d3.interpolateRgb('#e2e8f0', '#4f46e5')(segment.completeness);
    }
    return branchColor(segment.individual.lastName).hex;
  }

  function handleMove(event, segment) {
    if (!segment.individual || !containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    setTooltip({ x: event.clientX - rect.left, y: event.clientY - rect.top, individual: segment.individual });
  }

  return (
    <div ref={containerRef} className="relative rounded-xl border border-neutral-200 p-4 dark:border-neutral-800">
      <div className="mb-3 flex items-center justify-between">
        <p className="text-xs text-neutral-400">
          Molette pour zoomer, glisser pour déplacer. Clique un arc pour recentrer l'arbre, double-clique pour ouvrir sa fiche.
        </p>
        <div className="flex gap-1 text-xs">
          <button
            onClick={() => setColorMode('branch')}
            className={`rounded-full px-2.5 py-1 ${colorMode === 'branch' ? 'bg-accent-600 text-white' : 'bg-neutral-100 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300'}`}
          >
            Lignée
          </button>
          <button
            onClick={() => setColorMode('completeness')}
            className={`rounded-full px-2.5 py-1 ${colorMode === 'completeness' ? 'bg-accent-600 text-white' : 'bg-neutral-100 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300'}`}
          >
            Complétude
          </button>
        </div>
      </div>

      <svg ref={svgRef} viewBox={`${-size / 2} ${-size / 2} ${size} ${size}`} className="h-[600px] w-full cursor-grab active:cursor-grabbing">
        <g ref={gRef}>
          {segments.map((segment) => (
            <path
              key={`${segment.generation}:${segment.slotIndex}`}
              d={arcGenerator(segment)}
              fill={colorFor(segment)}
              stroke="white"
              strokeWidth={1}
              className={segment.individual ? 'cursor-pointer hover:opacity-80' : ''}
              onMouseMove={(e) => handleMove(e, segment)}
              onMouseLeave={() => setTooltip(null)}
              onClick={() => segment.individual && setRootId(segment.individual.id)}
              onDoubleClick={() => segment.individual && onOpenIndividual?.(segment.individual.id)}
            />
          ))}

          <circle r={ROOT_RADIUS} fill="#4f46e5" className={root ? 'cursor-pointer' : ''} onClick={() => root && setRootId(root.id)} />
          <text textAnchor="middle" dy="-0.2em" fontSize="11" fill="white" fontWeight="600">
            {root?.firstNames}
          </text>
          <text textAnchor="middle" dy="1.1em" fontSize="11" fill="white" fontWeight="600">
            {root?.lastName}
          </text>
        </g>
      </svg>

      {tooltip && (
        <div
          className="pointer-events-none absolute z-10 rounded-lg border border-neutral-200 bg-white px-3 py-2 text-xs shadow-lg dark:border-neutral-700 dark:bg-neutral-900"
          style={{ left: tooltip.x + 12, top: tooltip.y + 12 }}
        >
          <div className="font-medium">
            {tooltip.individual.firstNames} {tooltip.individual.lastName}
          </div>
          <div className="text-neutral-400">
            {formatGenealogyDate({ date: tooltip.individual.birthDate, datePrecision: tooltip.individual.birthDatePrecision })}
          </div>
        </div>
      )}
    </div>
  );
}
