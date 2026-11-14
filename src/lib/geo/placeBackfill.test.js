import { describe, it, expect, vi } from 'vitest';
vi.mock('../supabaseClient.js', () => ({ supabase: {} }));
import { backfillPatch, hierarchyFromAddress, placesNeedingBackfill } from './placeBackfill.js';
import { regionOfFrenchDepartment } from './frenchDepartments.js';

const millau = { city: 'Millau', county: 'Aveyron', state: 'Occitanie', country: 'France', country_code: 'fr' };

describe('regionOfFrenchDepartment', () => {
  it('retrouve la région sans tenir compte des accents ni des tirets', () => {
    expect(regionOfFrenchDepartment('Aveyron')).toBe('Occitanie');
    expect(regionOfFrenchDepartment("val d'oise")).toBe('Île-de-France');
    expect(regionOfFrenchDepartment('Arequipa')).toBeNull();
  });
});

describe('backfillPatch', () => {
  it('ne remplit que les cases vides', () => {
    const place = { city: 'Millau', department: 'Aveyron', region: '', country: null, geocode_precision: 'city' };
    expect(backfillPatch(place, millau)).toEqual({ region: 'Occitanie', country: 'France' });
  });

  it("n'écrase jamais une saisie, même différente", () => {
    const place = { city: 'Milhau', department: 'Aveyron', region: 'Midi-Pyrénées', country: 'France', geocode_precision: 'city' };
    expect(backfillPatch(place, millau)).toEqual({});
  });

  it('ne descend pas sous la précision du lieu', () => {
    expect(backfillPatch({ department: 'Aveyron', geocode_precision: 'department' }, millau)).toEqual({ region: 'Occitanie', country: 'France' });
    expect(backfillPatch({ geocode_precision: 'country' }, millau)).toEqual({ country: 'France' });
  });

  it('libellé libre : ne retient que les niveaux nommés dans le libellé', () => {
    expect(backfillPatch({ raw_label: 'Millau, Aveyron', geocode_precision: null }, millau)).toEqual({ city: 'Millau', department: 'Aveyron', region: 'Occitanie', country: 'France' });
    expect(backfillPatch({ raw_label: 'Aveyron', geocode_precision: null }, millau)).toEqual({ department: 'Aveyron', region: 'Occitanie', country: 'France' });
    expect(backfillPatch({ raw_label: 'Rouergue', geocode_precision: null }, millau)).toEqual({ country: 'France' });
  });

  it('Paris : la ville sert de département', () => {
    expect(hierarchyFromAddress({ city: 'Paris', state: 'Île-de-France', country: 'France', country_code: 'fr' }).department).toBe('Paris');
  });
});

describe('placesNeedingBackfill', () => {
  it('ignore les lieux complets ou non géocodés', () => {
    const full = { latitude: 1, longitude: 1, city: 'a', department: 'b', region: 'c', country: 'd' };
    expect(placesNeedingBackfill([full, { ...full, region: null }, { city: 'x' }])).toHaveLength(1);
  });
});
