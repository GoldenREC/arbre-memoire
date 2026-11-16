import { describe, it, expect, vi, afterEach } from 'vitest';
import { searchLocalities, searchLocalitiesByPostalCode, __test__ } from './openPlzApi.js';

const { parseFeatureDE, parseFeatureCH } = __test__;

describe('parseFeatureDE', () => {
  it('normalise une localité rurale (Landkreis séparé de la commune)', () => {
    const item = {
      postalCode: '82467',
      name: 'Garmisch-Partenkirchen',
      municipality: { name: 'Garmisch-Partenkirchen, M', type: 'Markt' },
      district: { name: 'Garmisch-Partenkirchen', type: 'Landkreis' },
      federalState: { name: 'Bayern' },
    };
    expect(parseFeatureDE(item)).toMatchObject({
      city: 'Garmisch-Partenkirchen',
      postalCode: '82467',
      department: 'Garmisch-Partenkirchen',
      arrondissement: '',
      region: 'Bayern',
      country: 'Allemagne',
    });
  });

  it('normalise une ville-arrondissement ("Kreisfreie Stadt") sans Landkreis', () => {
    const item = {
      postalCode: '10115',
      name: 'Berlin',
      municipality: { name: 'Berlin', type: 'Kreisfreie Stadt' },
      federalState: { name: 'Berlin' },
    };
    const parsed = parseFeatureDE(item);
    expect(parsed.department).toBe('');
    expect(parsed.arrondissement).toBe('Berlin');
    expect(parsed.region).toBe('Berlin');
  });
});

describe('parseFeatureCH', () => {
  it('normalise une commune suisse (canton + district)', () => {
    const item = {
      postalCode: '8001',
      name: 'Zürich',
      commune: { name: 'Zürich' },
      district: { name: 'Bezirk Zürich' },
      canton: { name: 'Zürich' },
    };
    expect(parseFeatureCH(item)).toMatchObject({
      city: 'Zürich',
      postalCode: '8001',
      department: 'Bezirk Zürich',
      region: 'Zürich',
      country: 'Suisse',
    });
  });
});

describe('searchLocalities (réseau)', () => {
  const originalFetch = global.fetch;
  afterEach(() => { global.fetch = originalFetch; });

  it('renvoie un tableau vide pour une requête vide, sans appeler fetch', async () => {
    global.fetch = vi.fn();
    expect(await searchLocalities('de', '')).toEqual([]);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('transforme la réponse OpenPLZ en lieux normalisés (Allemagne)', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ([{
        postalCode: '10115', name: 'Berlin',
        municipality: { name: 'Berlin', type: 'Kreisfreie Stadt' },
        federalState: { name: 'Berlin' },
      }]),
    });
    const results = await searchLocalities('de', 'Berlin');
    expect(results).toHaveLength(1);
    expect(results[0].city).toBe('Berlin');
  });

  it("renvoie un tableau vide si l'appel réseau échoue (jamais d'exception)", async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error('network down'));
    expect(await searchLocalities('de', 'Berlin')).toEqual([]);
  });

  it('renvoie un tableau vide pour un code pays inconnu', async () => {
    global.fetch = vi.fn();
    expect(await searchLocalities('xx', 'Test')).toEqual([]);
    expect(global.fetch).not.toHaveBeenCalled();
  });
});

describe('searchLocalitiesByPostalCode (réseau)', () => {
  const originalFetch = global.fetch;
  afterEach(() => { global.fetch = originalFetch; });

  it('renvoie un tableau vide pour un code postal vide', async () => {
    global.fetch = vi.fn();
    expect(await searchLocalitiesByPostalCode('de', '')).toEqual([]);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("renvoie un tableau vide si la réponse n'est pas ok", async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: false });
    expect(await searchLocalitiesByPostalCode('ch', '8001')).toEqual([]);
  });
});
