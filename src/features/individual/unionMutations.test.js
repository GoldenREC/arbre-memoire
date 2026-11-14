import { describe, it, expect } from 'vitest';
import { milestonesRequiringProof } from './unionMutations.js';

const EMPTY = { date: '', datePrecision: 'unknown', place: {} };
const DATED = { date: '2024-05-08', datePrecision: 'exact', place: { city: 'Besançon' } };

describe('milestonesRequiringProof', () => {
  it('« en couple » exige une preuve de mise en couple, même sans date connue', () => {
    expect(milestonesRequiringProof('couple', { start: EMPTY })).toEqual(['union_start']);
  });

  it('« mariée » exige la preuve du mariage ; la mise en couple seulement si elle est renseignée', () => {
    expect(milestonesRequiringProof('married', { start: EMPTY, marriage: EMPTY })).toEqual(['marriage']);
    expect(milestonesRequiringProof('married', { start: DATED, marriage: EMPTY })).toEqual(['union_start', 'marriage']);
  });

  it('« divorcée » exige les preuves du mariage et du divorce', () => {
    expect(milestonesRequiringProof('divorced', { start: EMPTY, marriage: EMPTY, divorce: EMPTY })).toEqual(['marriage', 'divorce']);
  });

  it('ignore les jalons masqués par le statut choisi', () => {
    expect(milestonesRequiringProof('couple', { start: EMPTY, marriage: DATED, divorce: DATED })).toEqual(['union_start']);
  });
});
