import { describe, expect, it } from 'vitest';
import { linkLook, linkPaths } from './familyBuses.js';

const link = (parentId, childId, x1, x2, y1 = 100, y2 = 200) => ({ parentId, childId, x1, x2, y1, y2 });

describe('linkPaths', () => {
  it('produit un trait par lien parental', () => {
    const paths = linkPaths([link('p1', 'c', 100, 300), link('p2', 'c', 200, 300)]);
    expect(paths).toHaveLength(2);
    expect(paths.map((p) => p.parentId).sort()).toEqual(['p1', 'p2']);
  });

  it('deux liens dans la même gouttière ont des voies horizontales différentes', () => {
    const paths = linkPaths([link('p1', 'c1', 100, 150), link('p2', 'c2', 400, 500)]);
    const laneYs = paths.map((p) => Number(p.d.split(' ')[5]));
    expect(new Set(laneYs).size).toBe(2);
  });

  it('chaque trait part du parent et arrive sur son enfant', () => {
    const [p] = linkPaths([link('p1', 'c', 50, 300)]);
    expect(p.d.startsWith('M 50 100 ')).toBe(true);
    expect(p.d.endsWith(' 300 200')).toBe(true);
  });
});

describe('linkLook', () => {
  it('reste fin et gris sans survol', () => {
    expect(linkLook({ parentId: 'p', childId: 'c' }, null, '#00f')).toMatchObject({ stroke: '#a3a3a3', strokeWidth: 1 });
  });
  it('prend sa couleur quand la personne survolée est l\'enfant ou le parent', () => {
    expect(linkLook({ parentId: 'p', childId: 'c' }, 'c', '#00f')).toMatchObject({ stroke: '#00f', strokeWidth: 2.5 });
    expect(linkLook({ parentId: 'p', childId: 'c' }, 'p', '#00f')).toMatchObject({ stroke: '#00f', strokeWidth: 2.5 });
  });
  it('s\'estompe quand il n\'est pas concerné', () => {
    expect(linkLook({ parentId: 'p', childId: 'c' }, 'x', '#00f').opacity).toBeLessThan(1);
  });
});
