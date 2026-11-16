import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { clampScale, fitView, zoomAt } from './treeCanvasMath.js';

/**
 * Canevas de l'arbre : zoom à la molette (ou boutons), déplacement à la souris,
 * « Ajuster » pour voir tout l'arbre. `bounds` = zone à faire tenir à l'écran ;
 * `fitKey` = quand il change, on réajuste la vue (nouvelle racine, nouvelles générations).
 */
export default function TreeCanvas({ bounds, fitKey, height = '72vh', children }) {
  const ref = useRef(null);
  const [view, setView] = useState({ scale: 1, x: 0, y: 0 });
  const drag = useRef(null);

  function fit() {
    const el = ref.current;
    if (!el || !bounds) return;
    setView(fitView(bounds, el.clientWidth, el.clientHeight));
  }

  useLayoutEffect(() => {
    fit();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fitKey]);

  // La molette zoome : écouteur non passif pour pouvoir annuler le défilement de la page.
  useEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    function onWheel(e) {
      e.preventDefault();
      const rect = el.getBoundingClientRect();
      const factor = e.deltaY < 0 ? 1.15 : 1 / 1.15;
      setView((v) => zoomAt(v, factor, e.clientX - rect.left, e.clientY - rect.top));
    }
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, []);

  function zoomBy(factor) {
    const el = ref.current;
    if (!el) return;
    setView((v) => zoomAt(v, factor, el.clientWidth / 2, el.clientHeight / 2));
  }

  function onPointerDown(e) {
    if (e.button !== 0) return;
    drag.current = { x: e.clientX, y: e.clientY, vx: view.x, vy: view.y };
    e.currentTarget.setPointerCapture?.(e.pointerId);
  }
  function onPointerMove(e) {
    if (!drag.current) return;
    const dx = e.clientX - drag.current.x;
    const dy = e.clientY - drag.current.y;
    setView((v) => ({ ...v, x: drag.current.vx + dx, y: drag.current.vy + dy }));
  }
  function onPointerUp() {
    drag.current = null;
  }

  return (
    <div className="relative overflow-hidden rounded-xl border border-neutral-200 bg-neutral-50 dark:border-neutral-800 dark:bg-neutral-950" style={{ height }}>
      <div className="absolute right-3 top-3 z-10 flex gap-1 text-sm">
        <button onClick={() => zoomBy(1.2)} className="h-8 w-8 rounded-lg bg-white shadow-sm hover:bg-neutral-100 dark:bg-neutral-900 dark:hover:bg-neutral-800" title="Zoomer" aria-label="Zoomer">+</button>
        <button onClick={() => zoomBy(1 / 1.2)} className="h-8 w-8 rounded-lg bg-white shadow-sm hover:bg-neutral-100 dark:bg-neutral-900 dark:hover:bg-neutral-800" title="Dézoomer" aria-label="Dézoomer">−</button>
        <button onClick={fit} className="h-8 rounded-lg bg-white px-2 text-xs shadow-sm hover:bg-neutral-100 dark:bg-neutral-900 dark:hover:bg-neutral-800" title="Tout voir">Ajuster</button>
      </div>
      <div
        ref={ref}
        className="h-full w-full cursor-grab select-none active:cursor-grabbing"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerLeave={onPointerUp}
      >
        <div style={{ transform: `translate(${view.x}px, ${view.y}px) scale(${clampScale(view.scale)})`, transformOrigin: '0 0', position: 'absolute', left: 0, top: 0 }}>
          {children}
        </div>
      </div>
    </div>
  );
}
