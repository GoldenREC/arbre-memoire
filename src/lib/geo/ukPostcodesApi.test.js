import { describe, it, expect, vi, afterEach } from 'vitest';
import { searchPlaces, searchByPostcode, __test__ } from './ukPostcodesApi.js';

const { parsePlace, parsePostcode } = __test__;

describe('parsePlace', () => {
  it('normalise un résultat de recherche par nom de lieu', () => {
    const p = {
      name_1: 'London', name_2: 'Greater London',
      county_unitary: 'Greater London', district_borough: 'Westminster',
      region: 'London', outcode: 'SW1', latitude: 51.5, longitude: -0.12,
    };
    expect(parsePlace(p)).toMatchObject({
      city: 'London',
      postalCode: 'SW1',
      department: 'Greater London',
      arrondissement: 'Westminster',
      region: 'London',
      country: 'Angleterre',
      latitude: 51.5,
      longitude: -0.12,
    });
  });
});

describe('parsePostcode', () => {
  it('normalise un résultat de recherche par postcode exact', () => {
    const p = {
      postcode: 'SW1A 1AA', admin_ward: 'St James\'s', admin_district: 'Westminster',
      admin_county: null, region: 'London', latitude: 51.5, longitude: -0.14,
    };
    const parsed = parsePostcode(p);
    expect(parsed.postalCode).toBe('SW1A 1AA');
    expect(parsed.department).toBe('Westminster');
    expect(parsed.region).toBe('London');
  });
});

describe('searchPlaces (réseau)', () => {
  const originalFetch = global.fetch;
  afterEach(() => { global.fetch = originalFetch; });

  it('renvoie un tableau vide pour une requête vide, sans appeler fetch', async () => {
    global.fetch = vi.fn();
    expect(await searchPlaces('')).toEqual([]);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('transforme la réponse en lieux normalisés', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ result: [{ name_1: 'London', region: 'London', outcode: 'SW1' }] }),
    });
    const results = await searchPlaces('london');
    expect(results).toHaveLength(1);
    expect(results[0].city).toBe('London');
  });

  it("renvoie un tableau vide si l'appel réseau échoue (jamais d'exception)", async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error('network down'));
    expect(await searchPlaces('london')).toEqual([]);
  });
});

describe('searchByPostcode (réseau)', () => {
  const originalFetch = global.fetch;
  afterEach(() => { global.fetch = originalFetch; });

  it('renvoie un tableau vide pour un postcode trop court', async () => {
    global.fetch = vi.fn();
    expect(await searchByPostcode('SW1')).toEqual([]);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("renvoie un tableau vide si la réponse n'est pas ok (postcode inconnu)", async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: false });
    expect(await searchByPostcode('SW1A1AA')).toEqual([]);
  });

  it('transforme une réponse valide en un seul lieu normalisé', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ result: { postcode: 'SW1A 1AA', admin_district: 'Westminster', region: 'London' } }),
    });
    const results = await searchByPostcode('SW1A1AA');
    expect(results).toHaveLength(1);
    expect(results[0].postalCode).toBe('SW1A 1AA');
  });
});
