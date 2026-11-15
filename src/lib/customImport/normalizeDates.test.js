import { describe, it, expect } from 'vitest';
import { normalizeImportDates, normalizePartialDate } from './normalizeDates.js';
import { validateCustomImport } from './validate.js';

describe('dates partielles à l\'import', () => {
  it('année seule et mois + année', () => {
    expect(normalizePartialDate('1829', 'exact')).toEqual({ date: '1829-01-01', precision: 'about' });
    expect(normalizePartialDate('1829-03', 'before')).toEqual({ date: '1829-03-01', precision: 'before' });
    expect(normalizePartialDate('1829-03-12', 'exact')).toEqual({ date: '1829-03-12', precision: 'exact' });
  });

  it('parcourt personnes, événements et unions', () => {
    const model = normalizeImportDates({
      individuals: [{ localId: 'a', birth: { date: '1829' }, events: [{ type: 'census', date: '1906' }] }],
      unions: [{ localId: 'u', startDate: '1850-06', marriage: { date: '1851', datePrecision: 'exact' } }],
    });
    expect(model.individuals[0].birth).toEqual({ date: '1829-01-01', datePrecision: 'about' });
    expect(model.individuals[0].events[0].date).toBe('1906-01-01');
    expect(model.unions[0]).toMatchObject({ startDate: '1850-06-01', startDatePrecision: 'about', marriage: { date: '1851-01-01', datePrecision: 'about' } });
  });

  it('la validation accepte une année seule', () => {
    const errors = validateCustomImport({ formatVersion: '1.0', individuals: [{ localId: 'a', firstNames: 'Joseph', lastName: 'Ternay', sex: 'M', birth: { date: '1829', datePrecision: 'about', place: null, proof: null } }], unions: [] });
    expect(errors.filter((e) => e.includes('date'))).toEqual([]);
  });
});
