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
    expect(formatGenealogyDateWithPref({ date: '1905-06-01', datePrecision: 'about' }, 'dmy')).toBe('vers 06/1905');
    expect(formatGenealogyDateWithPref({ date: '1905-06-01', datePrecision: 'before' }, 'ymd')).toBe('avant 1905-06');
  });

  it('gère un intervalle', () => {
    expect(formatGenealogyDateWithPref({ date: '1900-01-01', dateEnd: '1905-01-01', datePrecision: 'between' }, 'dmy')).toBe('entre 1900 et 1905');
  });

  it("retourne '?' sans date", () => {
    expect(formatGenealogyDateWithPref({ date: null })).toBe('?');
  });
});

import { formatGenealogyDate } from './dates.js';
import { partsToPartialIsoDate, isoDateToPartsFor } from './dateParts.js';

describe('dates partielles', () => {
  it("année seule : rangée au 1er janvier, affichée sans jour ni mois", () => {
    expect(partsToPartialIsoDate({ day: '', month: '', year: 1829 })).toEqual({ iso: '1829-01-01', partial: 'year' });
    expect(formatGenealogyDate({ date: '1829-01-01', datePrecision: 'about' })).toBe('vers 1829');
    expect(isoDateToPartsFor('1829-01-01', 'about')).toEqual({ day: '', month: '', year: 1829 });
  });

  it('mois + année', () => {
    expect(partsToPartialIsoDate({ day: '', month: 3, year: 1850 })).toEqual({ iso: '1850-03-01', partial: 'month' });
    expect(formatGenealogyDate({ date: '1850-03-01', datePrecision: 'before' })).toBe('avant mars 1850');
  });

  it('une date exacte au 1er janvier reste un 1er janvier', () => {
    expect(formatGenealogyDate({ date: '1829-01-01', datePrecision: 'exact' })).toBe('1 janv. 1829');
    expect(isoDateToPartsFor('1829-01-01', 'exact')).toEqual({ day: 1, month: 1, year: 1829 });
  });

  it('jour sans année : toujours incomplet', () => {
    expect(partsToPartialIsoDate({ day: 5, month: '', year: 1829 }).iso).toBeNull();
    expect(partsToPartialIsoDate({ day: 5, month: 2, year: '' }).iso).toBeNull();
  });
});
