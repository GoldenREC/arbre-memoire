import { describe, it, expect, vi, afterEach } from 'vitest';
import { searchCommunes, __test__ } from './banAddressApi.js';

const { parseContext, parseArrondissement, parseFeature } = __test__;

describe('parseContext', () => {
  it('découpe le format standard "code, département, région"', () => {
    expect(parseContext("06, Alpes-Maritimes, Provence-Alpes-Côte d'Azur")).toEqual({
      department: 'Alpes-Maritimes',
      region: "Provence-Alpes-Côte d'Azur",
    });
  });

  it('gère un contexte à 2 éléments en repliant sur le même nom', () => {
    expect(parseContext('75, Paris')).toEqual({ department: 'Paris', region: 'Paris' });
  });

  it('renvoie des champs vides pour un contexte manquant', () => {
    expect(parseContext(null)).toEqual({ department: '', region: '' });
    expect(parseContext('')).toEqual({ department: '', region: '' });
  });
});

describe('parseArrondissement', () => {
  it('extrait le numéro d\'arrondissement d\'un nom de commune-arrondissement', () => {
    expect(parseArrondissement('Paris 6e Arrondissement')).toBe('6e arrondissement');
    expect(parseArrondissement('Marseille 1er Arrondissement')).toBe('1er arrondissement');
  });

  it("renvoie une chaîne vide pour une commune ordinaire", () => {
    expect(parseArrondissement('Cagnes-sur-Mer')).toBe('');
  });
});

describe('parseFeature', () => {
  it('normalise une feature GeoJSON de commune standard', () => {
    const feature = {
      geometry: { coordinates: [7.1489, 43.6639] },
      properties: {
        label: 'Cagnes-sur-Mer',
        name: 'Cagnes-sur-Mer',
        city: 'Cagnes-sur-Mer',
        postcode: '06800',
        citycode: '06027',
        context: "06, Alpes-Maritimes, Provence-Alpes-Côte d'Azur",
      },
    };
    expect(parseFeature(feature)).toEqual({
      label: 'Cagnes-sur-Mer',
      city: 'Cagnes-sur-Mer',
      postalCode: '06800',
      citycode: '06027',
      department: 'Alpes-Maritimes',
      region: "Provence-Alpes-Côte d'Azur",
      country: 'France',
      arrondissement: '',
      latitude: 43.6639,
      longitude: 7.1489,
    });
  });

  it('détecte un arrondissement parisien et en déduit la ville parente "Paris"', () => {
    const feature = {
      geometry: { coordinates: [2.3364, 48.8496] },
      properties: {
        label: 'Paris 6e Arrondissement',
        name: 'Paris 6e Arrondissement',
        city: 'Paris',
        postcode: '75006',
        citycode: '75106',
        context: '75, Paris, Île-de-France',
      },
    };
    const parsed = parseFeature(feature);
    expect(parsed.city).toBe('Paris');
    expect(parsed.postalCode).toBe('75006');
    expect(parsed.arrondissement).toBe('6e arrondissement');
  });

  it('gère une feature incomplète sans planter', () => {
    expect(parseFeature({})).toMatchObject({ label: '', city: '', postalCode: '', arrondissement: '' });
    expect(parseFeature(null)).toMatchObject({ label: '', city: '' });
  });
});

describe('searchCommunes (réseau)', () => {
  const originalFetch = global.fetch;
  afterEach(() => { global.fetch = originalFetch; });

  it('renvoie un tableau vide pour une requête vide, sans appeler fetch', async () => {
    global.fetch = vi.fn();
    expect(await searchCommunes('')).toEqual([]);
    expect(await searchCommunes('   ')).toEqual([]);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('transforme les features de la réponse en lieux normalisés', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        features: [
          {
            geometry: { coordinates: [7.1489, 43.6639] },
            properties: {
              label: 'Cagnes-sur-Mer', name: 'Cagnes-sur-Mer', city: 'Cagnes-sur-Mer',
              postcode: '06800', citycode: '06027', context: "06, Alpes-Maritimes, Provence-Alpes-Côte d'Azur",
            },
          },
        ],
      }),
    });
    const results = await searchCommunes('cagnes sur mer');
    expect(results).toHaveLength(1);
    expect(results[0].city).toBe('Cagnes-sur-Mer');
    expect(results[0].department).toBe('Alpes-Maritimes');
  });

  it("renvoie un tableau vide si l'appel réseau échoue (jamais d'exception)", async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error('network down'));
    expect(await searchCommunes('cagnes')).toEqual([]);
  });

  it("renvoie un tableau vide si la réponse n'est pas ok", async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: false });
    expect(await searchCommunes('cagnes')).toEqual([]);
  });
});
