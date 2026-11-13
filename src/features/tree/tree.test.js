import { describe, it, expect } from 'vitest';
import { buildPedigree } from './buildPedigree.js';
import { buildDescendantTree } from './buildDescendants.js';
import { computeFanSegments } from './buildFanChart.js';

/**
 * Petit graphe de test :
 *   Jean (M) + Marie (F) -> Paul (M)
 *   Paul (M) + Alice (F) -> Léa (F), Max (M)
 * Jean et Marie n'ont pas de parents connus (branche manquante).
 */
function makeGraph() {
  const individuals = new Map([
    ['jean', { id: 'jean', firstNames: 'Jean', lastName: 'Dupont', sex: 'M' }],
    ['marie', { id: 'marie', firstNames: 'Marie', lastName: 'Martin', sex: 'F' }],
    ['paul', { id: 'paul', firstNames: 'Paul', lastName: 'Dupont', sex: 'M' }],
    ['alice', { id: 'alice', firstNames: 'Alice', lastName: 'Bernard', sex: 'F' }],
    ['lea', { id: 'lea', firstNames: 'Léa', lastName: 'Dupont', sex: 'F' }],
    ['max', { id: 'max', firstNames: 'Max', lastName: 'Dupont', sex: 'M' }],
  ]);

  const unions = new Map([
    ['u1', { id: 'u1', partnerIds: ['jean', 'marie'] }],
    ['u2', { id: 'u2', partnerIds: ['paul', 'alice'] }],
  ]);

  const parentsOf = new Map([
    ['paul', [{ parentId: 'jean', unionId: 'u1', filiationType: 'biological' }, { parentId: 'marie', unionId: 'u1', filiationType: 'biological' }]],
    ['lea', [{ parentId: 'paul', unionId: 'u2', filiationType: 'biological' }, { parentId: 'alice', unionId: 'u2', filiationType: 'biological' }]],
    ['max', [{ parentId: 'paul', unionId: 'u2', filiationType: 'biological' }, { parentId: 'alice', unionId: 'u2', filiationType: 'biological' }]],
  ]);
  const childrenOf = new Map([
    ['jean', ['paul']],
    ['marie', ['paul']],
    ['paul', ['lea', 'max']],
    ['alice', ['lea', 'max']],
  ]);

  return {
    individuals,
    unions,
    getIndividual: (id) => individuals.get(id) || null,
    getParents: (id) => parentsOf.get(id) || [],
    getChildren: (id) => childrenOf.get(id) || [],
    getUnions: (id) => [],
    getSpouses: (id) => [],
  };
}

describe('buildPedigree', () => {
  it('place la racine en (0,0) et les parents en génération 1', () => {
    const graph = makeGraph();
    const { nodesBySlot } = buildPedigree(graph, 'paul', 3);
    expect(nodesBySlot.get('0:0').individualId).toBe('paul');
    expect(nodesBySlot.get('1:0').individualId).toBe('jean'); // père
    expect(nodesBySlot.get('1:1').individualId).toBe('marie'); // mère
  });

  it('représente une branche manquante par un noeud individual=null', () => {
    const graph = makeGraph();
    const { nodesBySlot } = buildPedigree(graph, 'paul', 3);
    // Jean et Marie n'ont pas de parents connus -> génération 2 vide
    expect(nodesBySlot.get('2:0').individual).toBeNull();
    expect(nodesBySlot.get('2:1').individual).toBeNull();
  });

  it("s'arrête à la profondeur demandée", () => {
    const graph = makeGraph();
    const { nodesBySlot } = buildPedigree(graph, 'paul', 1);
    expect(nodesBySlot.has('2:0')).toBe(false);
  });
});

describe('buildDescendantTree', () => {
  it('regroupe les enfants par union', () => {
    const graph = makeGraph();
    const tree = buildDescendantTree(graph, 'paul');
    expect(tree.familyGroups).toHaveLength(1);
    expect(tree.familyGroups[0].partner.id).toBe('alice');
    expect(tree.familyGroups[0].children.map((c) => c.individualId).sort()).toEqual(['lea', 'max']);
  });

  it('respecte le repliement (collapsed)', () => {
    const graph = makeGraph();
    const tree = buildDescendantTree(graph, 'paul', { collapsed: new Set(['paul']) });
    expect(tree.hasChildren).toBe(true);
    expect(tree.familyGroups[0].children).toHaveLength(0);
  });
});

describe('computeFanSegments', () => {
  it('génère 2^g segments par génération', () => {
    const graph = makeGraph();
    const { nodesBySlot } = buildPedigree(graph, 'paul', 2);
    const segments = computeFanSegments(nodesBySlot, 2);
    const gen1 = segments.filter((s) => s.generation === 1);
    const gen2 = segments.filter((s) => s.generation === 2);
    expect(gen1).toHaveLength(2);
    expect(gen2).toHaveLength(4);
  });
});
