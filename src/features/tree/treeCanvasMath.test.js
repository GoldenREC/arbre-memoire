import { describe, expect, it } from 'vitest';
import { MAX_SCALE, MIN_SCALE, clampScale, fitView, zoomAt } from './treeCanvasMath.js';

describe('treeCanvasMath', () => {
  it('borne le zoom', () => {
    expect(clampScale(10)).toBe(MAX_SCALE);
    expect(clampScale(0.01)).toBe(MIN_SCALE);
    expect(clampScale(1)).toBe(1);
  });

  it('zoome en gardant le point sous le curseur immobile', () => {
    const view = { scale: 1, x: 0, y: 0 };
    const next = zoomAt(view, 2, 100, 50);
    expect(next.scale).toBe(2);
    // le point monde (100, 50) reste en (100, 50) à l'écran
    expect(100 * next.scale + next.x).toBeCloseTo(100 * view.scale + view.x, 5);
    expect(50 * next.scale + next.y).toBeCloseTo(50 * view.scale + view.y, 5);
  });

  it('ajuste la vue : tout le contenu tient, centré', () => {
    const bounds = { minX: 0, maxX: 1000, minY: 0, maxY: 500 };
    const v = fitView(bounds, 500, 500);
    expect(v.scale).toBeCloseTo(0.5, 5);
    expect(1000 * v.scale + v.x).toBeCloseTo(500, 5);
    expect(v.x).toBeCloseTo(0, 5);
  });

  it('n\'agrandit pas un petit arbre au-delà de 1', () => {
    expect(fitView({ minX: 0, maxX: 100, minY: 0, maxY: 100 }, 1000, 1000).scale).toBe(1);
  });
});
