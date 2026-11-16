import { describe, expect, it } from 'vitest';
import { linkLook, linkPaths, unionLook } from './familyBuses.js';

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

describe('unionLook et trait commun', () => {
  it('une union est grise par défaut et colorée quand un de ses conjoints est survolé', () => {
    expect(unionLook(['a', 'b'], null, '#00f').stroke).toBe('#a3a3a3');
    expect(unionLook(['a', 'b'], 'b', '#00f')).toMatchObject({ stroke: '#00f', strokeWidth: 2.5 });
    expect(unionLook(['a', 'b'], 'z', '#00f').opacity).toBeLessThan(1);
  });

  it('deux parents d\'un même couple avec le même type de lien forment un seul trait', () => {
    const graph = {
      parentsOf: new Map([['c', [{ parentId: 'a', filiationType: 'biological' }, { parentId: 'b', filiationType: 'biological' }]]]),
      getUnions: (id) => (id === 'a' || id === 'b' ? [{ partnerIds: ['a', 'b'] }] : []),
    };
    const links = [
      { parentId: 'a', childId: 'c', x1: 100, x2: 300, y1: 100, y2: 200 },
      { parentId: 'b', childId: 'c', x1: 400, x2: 300, y1: 100, y2: 200 },
    ];
    const paths = linkPaths(links, graph);
    expect(paths).toHaveLength(1);
    expect(paths[0].parentIds).toEqual(['a', 'b']);
  });

  it('deux parents de types différents restent deux traits', () => {
    const graph = {
      parentsOf: new Map([['c', [{ parentId: 'a', filiationType: 'adoption_plenary' }, { parentId: 'b', filiationType: 'biological' }]]]),
      getUnions: (id) => (id === 'a' || id === 'b' ? [{ partnerIds: ['a', 'b'] }] : []),
    };
    const links = [
      { parentId: 'a', childId: 'c', x1: 100, x2: 300, y1: 100, y2: 200 },
      { parentId: 'b', childId: 'c', x1: 400, x2: 300, y1: 100, y2: 200 },
    ];
    expect(linkPaths(links, graph)).toHaveLength(2);
  });
});

describe('trait commun pour un enfant à plus de deux parents', () => {
  it('fusionne le couple de même type et laisse le troisième parent seul', () => {
    const graph = {
      parentsOf: new Map([['c', [
        { parentId: 'a', filiationType: 'biological' },
        { parentId: 'b', filiationType: 'biological' },
        { parentId: 'z', filiationType: 'adoption_simple' },
      ]]]),
      getUnions: (id) => (id === 'a' || id === 'b' ? [{ partnerIds: ['a', 'b'] }] : []),
    };
    const links = [
      { parentId: 'a', childId: 'c', x1: 100, x2: 300, y1: 100, y2: 200 },
      { parentId: 'b', childId: 'c', x1: 400, x2: 300, y1: 100, y2: 200 },
      { parentId: 'z', childId: 'c', x1: 700, x2: 300, y1: 100, y2: 200 },
    ];
    const paths = linkPaths(links, graph);
    expect(paths).toHaveLength(2);
    expect(paths.some((p) => p.parentIds && p.parentIds.includes('a') && p.parentIds.includes('b'))).toBe(true);
  });
});
