import { describe, it, expect, vi, afterEach } from 'vitest';
import { searchPlaces, __test__ } from './nominatimPlacesApi.js';

const { parseResult, cityOf } = __test__;

describe('cityOf', () => {
  it("retombe sur town/village/municipality quand city est absent", () => {
    expect(cityOf({ city: 'Madrid' })).toBe('Madrid');
    expect(cityOf({ town: 'Faro' })).toBe('Faro');
    expect(cityOf({ village: 'Petit-Village' })).toBe('Petit-Village');
    expect(cityOf({ municipality: 'Athina' })).toBe('Athina');
    expect(cityOf({})).toBe('');
  });
});

describe('parseResult', () => {
  it('normalise un résultat Nominatim espagnol', () => {
    const item = {
      display_name: 'Madrid, Communauté de Madrid, Espagne',
      lat: '40.4', lon: '-3.7',
      address: { city: 'Madrid', state: 'Communauté de Madrid', country: 'Espagne', country_code: 'es' },
    };
    expect(parseResult(item, 'Espagne')).toMatchObject({
      city: 'Madrid',
      region: 'Communauté de Madrid',
      country: 'Espagne',
      latitude: 40.4,
      longitude: -3.7,
    });
  });

  it('gère un résultat incomplet sans planter', () => {
    expect(parseResult({}, 'Grèce')).toMatchObject({ city: '', country: 'Grèce', latitude: null });
  });
});

describe('searchPlaces (réseau)', () => {
  const originalFetch = global.fetch;
  afterEach(() => { global.fetch = originalFetch; });

  it('renvoie un tableau vide pour une requête vide, sans appeler fetch', async () => {
    global.fetch = vi.fn();
    expect(await searchPlaces('es', 'Espagne', '')).toEqual([]);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('transforme la réponse en lieux normalisés', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ([{ display_name: 'Madrid', lat: '40.4', lon: '-3.7', address: { city: 'Madrid' } }]),
    });
    const results = await searchPlaces('es', 'Espagne', 'madrid');
    expect(results).toHaveLength(1);
    expect(results[0].city).toBe('Madrid');
  });

  it("renvoie un tableau vide si l'appel réseau échoue (jamais d'exception)", async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error('network down'));
    expect(await searchPlaces('es', 'Espagne', 'madrid')).toEqual([]);
  });

  it("renvoie un tableau vide si la réponse n'est pas ok", async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: false });
    expect(await searchPlaces('pt', 'Portugal', 'lisboa')).toEqual([]);
  });
});
