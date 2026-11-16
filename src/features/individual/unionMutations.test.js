import { describe, it, expect } from 'vitest';
import { milestonesRequiringProof } from './unionMutations.js';

const EMPTY = { date: '', datePrecision: 'unknown', place: {} };
const DATED = { date: '2024-05-08', datePrecision: 'exact', place: { city: 'Besançon' } };

describe('milestonesRequiringProof', () => {
  it('« en couple » ne demande aucune preuve : la mise en couple n\'a pas de document officiel', () => {
    expect(milestonesRequiringProof('couple', { start: EMPTY })).toEqual([]);
  });

  it('« mariée » exige la preuve du mariage seulement ; la mise en couple n\'en demande jamais', () => {
    expect(milestonesRequiringProof('married', { start: EMPTY, marriage: EMPTY })).toEqual(['marriage']);
    expect(milestonesRequiringProof('married', { start: DATED, marriage: EMPTY })).toEqual(['marriage']);
  });

  it('« divorcée » exige les preuves du mariage et du divorce', () => {
    expect(milestonesRequiringProof('divorced', { start: EMPTY, marriage: EMPTY, divorce: EMPTY })).toEqual(['marriage', 'divorce']);
  });

  it('« séparée » ne demande aucune preuve, même avec date et lieu de séparation', () => {
    expect(milestonesRequiringProof('separated', { start: DATED, separation: DATED })).toEqual([]);
  });

  it('ignore les jalons masqués par le statut choisi', () => {
    expect(milestonesRequiringProof('couple', { start: EMPTY, marriage: DATED, divorce: DATED })).toEqual([]);
  });
});
