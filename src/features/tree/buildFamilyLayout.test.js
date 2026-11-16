import { describe, expect, it } from 'vitest';
import { buildFamilyLayout, computeLevels } from './buildFamilyLayout.js';

// Fixture au format de loadFamilyGraph.
function fakeGraph({ people, unions = [], links = [] }) {
  const parentsOf = (id) => links.filter((l) => l.childId === id).map((l) => ({ parentId: l.parentId, unionId: l.unionId ?? null, filiationType: l.filiationType || 'biological' }));
  const childrenOf = (id) => links.filter((l) => l.parentId === id).map((l) => l.childId);
  const unionsOf = (id) => unions.filter((u) => u.partnerIds.includes(id));
  return {
    getIndividual: (id) => (people[id] ? { id, birthDate: people[id].birth || null } : null),
    getParents: parentsOf,
    getChildren: childrenOf,
    getUnions: unionsOf,
    getSpouses: (id) => unionsOf(id).flatMap((u) => u.partnerIds).filter((p) => p !== id),
  };
}

// Famille : grands-parents G1+G2 -> Père (+ sa sœur Tante) ; Père + Mère -> Moi, frère Toi2 ; Moi + Épouse -> Enfant.
const people = { g1: {}, g2: {}, pere: { birth: '1950' }, tante: { birth: '1952' }, mere: {}, moi: { birth: '1980' }, toi2: { birth: '1985' }, epouse: {}, enfant: {} };
const unions = [
  { id: 'uG', partnerIds: ['g1', 'g2'] },
  { id: 'uP', partnerIds: ['pere', 'mere'] },
  { id: 'uM', partnerIds: ['moi', 'epouse'] },
];
const links = [
  { parentId: 'g1', childId: 'pere', unionId: 'uG' },
  { parentId: 'g2', childId: 'pere', unionId: 'uG' },
  { parentId: 'g1', childId: 'tante', unionId: 'uG' },
  { parentId: 'g2', childId: 'tante', unionId: 'uG' },
  { parentId: 'pere', childId: 'moi', unionId: 'uP' },
  { parentId: 'mere', childId: 'moi', unionId: 'uP' },
  { parentId: 'pere', childId: 'toi2', unionId: 'uP' },
  { parentId: 'mere', childId: 'toi2', unionId: 'uP' },
  { parentId: 'moi', childId: 'enfant', unionId: 'uM' },
  { parentId: 'epouse', childId: 'enfant', unionId: 'uM' },
];
const graph = fakeGraph({ people, unions, links });

describe('computeLevels', () => {
  it('place les ancêtres au-dessus, les descendants en dessous, les conjoints au même niveau', () => {
    const lv = computeLevels(graph, 'moi');
    expect(lv.get('pere')).toBe(1);
    expect(lv.get('mere')).toBe(1);
    expect(lv.get('g1')).toBe(2);
    expect(lv.get('toi2')).toBe(0);
    expect(lv.get('epouse')).toBe(0);
    expect(lv.get('enfant')).toBe(-1);
  });
});

describe('buildFamilyLayout', () => {
  const layout = buildFamilyLayout(graph, 'moi');

  it('renvoie null pour une racine inconnue', () => {
    expect(buildFamilyLayout(graph, 'inconnu')).toBeNull();
  });

  it('place chaque personne une seule fois', () => {
    const ids = layout.nodes.map((n) => n.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.sort()).toEqual(['enfant', 'epouse', 'g1', 'g2', 'mere', 'moi', 'pere', 'tante', 'toi2'].sort());
  });

  it('range les générations de haut en bas : ancêtres, racine, descendants', () => {
    const y = (id) => layout.nodes.find((n) => n.id === id).y;
    expect(y('g1')).toBeLessThan(y('pere'));
    expect(y('pere')).toBeLessThan(y('moi'));
    expect(y('moi')).toBeLessThan(y('enfant'));
  });

  it('met les frères et sœurs sur la même ligne', () => {
    const y = (id) => layout.nodes.find((n) => n.id === id).y;
    expect(y('moi')).toBe(y('toi2'));
  });

  it('ne fait jamais se chevaucher deux cartes sur la même ligne', () => {
    const rows = new Map();
    for (const n of layout.nodes) {
      if (!rows.has(n.y)) rows.set(n.y, []);
      rows.get(n.y).push(n.x);
    }
    for (const xs of rows.values()) {
      const sorted = [...xs].sort((a, b) => a - b);
      for (let i = 1; i < sorted.length; i++) expect(sorted[i] - sorted[i - 1]).toBeGreaterThanOrEqual(208);
    }
  });

  it('centre le parent au-dessus de l\'espace de ses enfants', () => {
    const x = (id) => layout.nodes.find((n) => n.id === id).x;
    const kidsX = [x('moi'), x('toi2')];
    const center = (Math.min(...kidsX) + Math.max(...kidsX)) / 2;
    expect(x('pere')).toBeGreaterThanOrEqual(Math.min(...kidsX) - 1);
    expect(x('pere')).toBeLessThanOrEqual(Math.max(...kidsX) + 1);
    expect(Math.abs(x('pere') - center)).toBeLessThan(400);
  });

  it('renvoie un lien par enfant vers ses parents', () => {
    const childIds = layout.links.map((l) => l.childId);
    expect(childIds).toEqual(expect.arrayContaining(['moi', 'toi2', 'enfant', 'pere', 'tante']));
  });
});

describe('frères et sœurs', () => {
  it('sans l\'option, les frères et sœurs de la racine et des ancêtres restent cachés', () => {
    const lv = computeLevels(graph, 'moi', { showSiblings: false });
    expect(lv.has('toi2')).toBe(false); // sœur de moi
    expect(lv.has('tante')).toBe(false); // sœur du père
    expect(lv.has('pere')).toBe(true); // ancêtre gardé
    expect(lv.has('enfant')).toBe(true); // descendant gardé
  });
  it('avec l\'option, ils apparaissent', () => {
    const lv = computeLevels(graph, 'moi', { showSiblings: true });
    expect(lv.has('toi2')).toBe(true);
    expect(lv.has('tante')).toBe(true);
  });
});
