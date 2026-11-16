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
  it('suit l\'ordre complet : plénière, biologique déclaré, reconnaissance, simple, non déclaré, abandonné, accueil, inconnu', () => {
    const types = ['foster', 'unknown', 'abandoned', 'biological_unrecognized', 'adoption_simple', 'late_recognition', 'biological', 'adoption_plenary'];
    const r = rankParentLinks(types.map((t, i) => link(String(i), t)));
    expect(r.map((l) => l.filiationType)).toEqual(['adoption_plenary', 'biological', 'late_recognition', 'adoption_simple', 'biological_unrecognized', 'abandoned', 'foster', 'unknown']);
  });
  it('ne modifie pas le tableau d\'origine', () => {
    const src = [link('a', 'unknown'), link('b', 'biological')];
    rankParentLinks(src);
    expect(src[0].parentId).toBe('a');
  });
});
