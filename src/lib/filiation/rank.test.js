import { describe, expect, it } from 'vitest';
import { rankParentLinks } from './rank.js';

const link = (parentId, filiationType) => ({ parentId, filiationType });

describe('rankParentLinks', () => {
  it('biologique l\'emporte sur adoption simple', () => {
    expect(rankParentLinks([link('a', 'adoption_simple'), link('b', 'biological')]).map((l) => l.parentId)).toEqual(['b', 'a']);
  });
  it('adoption plénière l\'emporte sur tout', () => {
    const r = rankParentLinks([link('a', 'biological'), link('b', 'adoption_simple'), link('c', 'adoption_plenary')]);
    expect(r[0].parentId).toBe('c');
  });
  it('famille d\'accueil et inconnu sont en bas', () => {
    const r = rankParentLinks([link('a', 'unknown'), link('b', 'adoption_simple'), link('c', 'foster')]);
    expect(r.map((l) => l.parentId)).toEqual(['b', 'a', 'c']);
  });
  it('ne modifie pas le tableau d\'origine', () => {
    const src = [link('a', 'unknown'), link('b', 'biological')];
    rankParentLinks(src);
    expect(src[0].parentId).toBe('a');
  });
});
