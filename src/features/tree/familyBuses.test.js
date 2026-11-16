import { describe, expect, it } from 'vitest';
import { childBuses } from './familyBuses.js';

const link = (parentId, childId, x1, x2, y1 = 100, y2 = 200) => ({ parentId, childId, x1, x2, y1, y2 });

describe('childBuses', () => {
  it('regroupe les liens d\'un enfant sur une seule barre', () => {
    const buses = childBuses([link('p1', 'c', 100, 300), link('p2', 'c', 200, 300)]);
    expect(buses).toHaveLength(1);
    expect(buses[0].drops).toHaveLength(2);
  });

  it('deux enfants dans la même gouttière ont des barres à des hauteurs différentes', () => {
    const buses = childBuses([
      link('p1', 'c1', 100, 150),
      link('p2', 'c1', 200, 150),
      link('p1', 'c2', 100, 500),
      link('p3', 'c2', 400, 500),
    ]);
    const ys = buses.map((b) => b.busY);
    expect(new Set(ys).size).toBe(2);
  });

  it('une barre couvre toujours tous ses parents et son enfant', () => {
    const [b] = childBuses([link('p1', 'c', 50, 300), link('p2', 'c', 400, 300)]);
    expect(b.minX).toBe(50);
    expect(b.maxX).toBe(400);
  });
});
