import { useCallback, useLayoutEffect, useRef, useState } from 'react';

/**
 * Permet d'enregistrer la ref DOM de chaque carte sous une clé stable
 * (ex: "2:3" pour le slot génération 2 / index 3), sans provoquer de
 * re-render à chaque montage de carte.
 */
export function useNodeRefs() {
  const refsMap = useRef(new Map());
  const register = useCallback(
    (key) => (el) => {
      if (el) refsMap.current.set(key, el);
      else refsMap.current.delete(key);
    },
    []
  );
  return { refsMap, register };
}

/**
 * Surcouche SVG qui relie deux cartes par une courbe, en mesurant leurs
 * positions réelles dans le DOM — plus robuste que des calculs CSS fixes
 * quand les cartes n'ont pas toutes la même hauteur. `direction`
 * contrôle le sens de la courbe : 'horizontal' (ascendance, gauche vers
 * droite) ou 'vertical' (descendance, haut vers bas). Chaque arête peut
 * porter un `style` optionnel { color, dash, width }.
 */
export default function TreeConnectorsOverlay({ containerRef, refsMap, edges, direction = 'horizontal', color }) {
  const [paths, setPaths] = useState([]);
  const strokeColor = color || 'currentColor';

  const recompute = useCallback(() => {
    const container = containerRef.current;
    if (!container) return;
    const containerRect = container.getBoundingClientRect();
    const next = [];

    for (const { from, to, style } of edges) {
      const fromEl = refsMap.current.get(from);
      const toEl = refsMap.current.get(to);
      if (!fromEl || !toEl) continue;
      const a = fromEl.getBoundingClientRect();
      const b = toEl.getBoundingClientRect();

      if (direction === 'vertical') {
        const x1 = a.left + a.width / 2 - containerRect.left + container.scrollLeft;
        const y1 = a.bottom - containerRect.top + container.scrollTop;
        const x2 = b.left + b.width / 2 - containerRect.left + container.scrollLeft;
        const y2 = b.top - containerRect.top + container.scrollTop;
        const midY = (y1 + y2) / 2;
        next.push({ d: `M ${x1} ${y1} C ${x1} ${midY}, ${x2} ${midY}, ${x2} ${y2}`, style });
      } else {
        const x1 = a.right - containerRect.left + container.scrollLeft;
        const y1 = a.top + a.height / 2 - containerRect.top + container.scrollTop;
        const x2 = b.left - containerRect.left + container.scrollLeft;
        const y2 = b.top + b.height / 2 - containerRect.top + container.scrollTop;
        const midX = (x1 + x2) / 2;
        next.push({ d: `M ${x1} ${y1} C ${midX} ${y1}, ${midX} ${y2}, ${x2} ${y2}`, style });
      }
    }
    setPaths(next);
  }, [containerRef, refsMap, edges, direction]);

  useLayoutEffect(() => {
    recompute();
    const container = containerRef.current;
    if (!container) return undefined;

    const observer = new ResizeObserver(() => recompute());
    observer.observe(container);
    window.addEventListener('resize', recompute);
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', recompute);
    };
  }, [recompute, containerRef]);

  return (
    <svg className="pointer-events-none absolute inset-0 h-full w-full overflow-visible text-neutral-300 dark:text-neutral-700">
      {paths.map((p, i) => (
        <path
          key={i}
          d={p.d}
          fill="none"
          stroke={p.style?.color || strokeColor}
          strokeWidth={p.style?.width || 1.5}
          strokeDasharray={p.style?.dash || undefined}
        />
      ))}
    </svg>
  );
}
