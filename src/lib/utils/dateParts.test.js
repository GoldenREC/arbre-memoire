import { describe, it, expect, vi, afterEach } from 'vitest';
import { daysInMonth, partsToIsoDate, isoDateToParts, yearOptions, MIN_GENEALOGY_YEAR } from './dateParts.js';

describe('daysInMonth', () => {
  it('connaît le nombre de jours de chaque mois pour une année non bissextile', () => {
    expect(daysInMonth(1995, 11)).toBe(30); // novembre 1995 : 30 jours, pas 31
    expect(daysInMonth(1995, 2)).toBe(28);
    expect(daysInMonth(1995, 1)).toBe(31);
  });

  it('gère les années bissextiles pour février', () => {
    expect(daysInMonth(2024, 2)).toBe(29); // bissextile
    expect(daysInMonth(2023, 2)).toBe(28); // non bissextile
    expect(daysInMonth(2000, 2)).toBe(29); // bissextile (divisible par 400)
    expect(daysInMonth(1900, 2)).toBe(28); // non bissextile (divisible par 100, pas 400)
  });
});

describe('partsToIsoDate', () => {
  it('compose une date valide', () => {
    expect(partsToIsoDate({ day: 31, month: 1, year: 1995 })).toBe('1995-01-31');
  });

  it('rejette le 31 novembre (mois à 30 jours)', () => {
    expect(partsToIsoDate({ day: 31, month: 11, year: 1995 })).toBeNull();
  });

  it('rejette le 29 février une année non bissextile', () => {
    expect(partsToIsoDate({ day: 29, month: 2, year: 1995 })).toBeNull();
  });

  it('accepte le 29 février une année bissextile', () => {
    expect(partsToIsoDate({ day: 29, month: 2, year: 2024 })).toBe('2024-02-29');
  });

  it('rejette une année future', () => {
    expect(partsToIsoDate({ day: 31, month: 1, year: 2150 })).toBeNull();
  });

  it('renvoie null si un champ est incomplet', () => {
    expect(partsToIsoDate({ day: '', month: 1, year: 1995 })).toBeNull();
    expect(partsToIsoDate({ day: 1, month: '', year: 1995 })).toBeNull();
    expect(partsToIsoDate({ day: 1, month: 1, year: '' })).toBeNull();
  });

  it('pad les jours/mois sur 2 chiffres', () => {
    expect(partsToIsoDate({ day: 5, month: 3, year: 1995 })).toBe('1995-03-05');
  });
});

describe('isoDateToParts', () => {
  it('décompose une date ISO', () => {
    expect(isoDateToParts('1995-01-31')).toEqual({ year: 1995, month: 1, day: 31 });
  });

  it('renvoie des champs vides pour null/vide/invalide', () => {
    expect(isoDateToParts(null)).toEqual({ day: '', month: '', year: '' });
    expect(isoDateToParts('')).toEqual({ day: '', month: '', year: '' });
    expect(isoDateToParts('pas une date')).toEqual({ day: '', month: '', year: '' });
  });
});

describe('yearOptions', () => {
  afterEach(() => vi.useRealTimers());

  it("part de l'année courante et descend jusqu'à MIN_GENEALOGY_YEAR", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-06-15'));
    const years = yearOptions();
    expect(years[0]).toBe(2026);
    expect(years[years.length - 1]).toBe(MIN_GENEALOGY_YEAR);
    expect(years.length).toBe(2026 - MIN_GENEALOGY_YEAR + 1);
  });
});
