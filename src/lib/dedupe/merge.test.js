import { describe, it, expect } from 'vitest';
import { mergeIndividuals, mergeLiveIndividuals, applyConflictResolutions } from './merge.js';

describe('mergeIndividuals (import GEDCOM)', () => {
  it("ne signale aucun conflit quand les deux côtés sont d'accord ou que l'un est vide", () => {
    const existing = { firstNames: 'Jean', lastName: 'Dupont', birthDate: null };
    const incoming = { firstNames: 'Jean', lastName: 'Dupont', birthDate: '1950-01-01' };
    const { merged, conflicts } = mergeIndividuals(existing, incoming);
    expect(conflicts).toHaveLength(0);
    expect(merged.birthDate).toBe('1950-01-01'); // valeur existante vide -> on prend l'entrante
  });

  it('signale un conflit quand les deux côtés ont une valeur différente et non vide', () => {
    const existing = { firstNames: 'Jean', lastName: 'Dupont', occupation: 'Forgeron' };
    const incoming = { firstNames: 'Jean', lastName: 'Dupont', occupation: 'Maréchal-ferrant' };
    const { merged, conflicts } = mergeIndividuals(existing, incoming);
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0]).toMatchObject({ field: 'occupation', existingValue: 'Forgeron', incomingValue: 'Maréchal-ferrant' });
    expect(merged.occupation).toBe('Forgeron'); // valeur existante gardée par défaut
  });

  it('concatène les biographies au lieu de forcer un choix', () => {
    const existing = { firstNames: 'Jean', lastName: 'Dupont', biography: 'Né à Lyon.' };
    const incoming = { firstNames: 'Jean', lastName: 'Dupont', biography: 'Mort à Paris.' };
    const { merged } = mergeIndividuals(existing, incoming);
    expect(merged.biography).toContain('Né à Lyon.');
    expect(merged.biography).toContain('Mort à Paris.');
    expect(merged.biographyAutoMerged).toBe(true);
  });
});

describe('applyConflictResolutions', () => {
  it("applique le choix 'incoming' sur un champ en conflit et garde la valeur par défaut sinon", () => {
    const mergeResult = {
      merged: { firstNames: 'Jean', occupation: 'Forgeron' },
      conflicts: [{ field: 'occupation', existingValue: 'Forgeron', incomingValue: 'Maréchal-ferrant' }],
    };
    const final = applyConflictResolutions(mergeResult, { occupation: 'incoming' });
    expect(final.occupation).toBe('Maréchal-ferrant');
    expect(final.firstNames).toBe('Jean');
  });
});

describe('mergeLiveIndividuals (fusion de doublons depuis Audit)', () => {
  const kept = { id: 'a', firstNames: 'Jean', lastName: 'Dupont', birthDate: '1950-01-01', occupation: 'Forgeron', birthPlaceId: 'place-a' };
  const removed = { id: 'b', firstNames: 'Jean', lastName: 'Dupont', birthDate: '1950-01-02', occupation: null, birthPlaceId: 'place-b' };

  it('signale un conflit uniquement sur les champs fusionnables qui diffèrent réellement', () => {
    const { conflicts } = mergeLiveIndividuals(kept, removed);
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0].field).toBe('birthDate');
  });

  it('ne fusionne jamais les lieux (UUID) — la fiche conservée garde son propre lieu', () => {
    const { merged, conflicts } = mergeLiveIndividuals(kept, removed);
    expect(merged.birthPlaceId).toBe('place-a');
    expect(conflicts.some((c) => c.field === 'birthPlaceId')).toBe(false);
  });

  it('reprend la valeur de la fiche supprimée quand la fiche conservée est vide sur ce champ', () => {
    const { merged, conflicts } = mergeLiveIndividuals(kept, removed);
    expect(merged.occupation).toBe('Forgeron');
    expect(conflicts.some((c) => c.field === 'occupation')).toBe(false);
  });
});
