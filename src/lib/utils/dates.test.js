import { describe, it, expect } from 'vitest';
import { formatGenealogyDateWithPref } from './dates.js';

describe('formatGenealogyDateWithPref', () => {
  it('formate en JJ/MM/AAAA par défaut', () => {
    expect(formatGenealogyDateWithPref({ date: '1930-07-10', datePrecision: 'exact' })).toBe('10/07/1930');
  });

  it('formate en AAAA-MM-JJ sur demande', () => {
    expect(formatGenealogyDateWithPref({ date: '1930-07-10', datePrecision: 'exact' }, 'ymd')).toBe('1930-07-10');
  });

  it('conserve les préfixes de précision', () => {
    expect(formatGenealogyDateWithPref({ date: '1905-06-01', datePrecision: 'about' }, 'dmy')).toBe('vers 01/06/1905');
    expect(formatGenealogyDateWithPref({ date: '1905-06-01', datePrecision: 'before' }, 'ymd')).toBe('avant 1905-06-01');
  });

  it('gère un intervalle', () => {
    expect(formatGenealogyDateWithPref({ date: '1900-01-01', dateEnd: '1905-01-01', datePrecision: 'between' }, 'dmy')).toBe('entre 01/01/1900 et 01/01/1905');
  });

  it("retourne '?' sans date", () => {
    expect(formatGenealogyDateWithPref({ date: null })).toBe('?');
  });
});
