import { describe, it, expect } from 'vitest';
import { buildGeocodeLevels, isApproximateGeocodePrecision } from './geocoder.js';

describe('buildGeocodeLevels', () => {
  it('ne renvoie qu\'un seul niveau à partir de raw_label quand aucun champ structuré n\'est renseigné', () => {
    const place = { raw_label: 'Grasse, Alpes-Maritimes, France' };
    expect(buildGeocodeLevels(place)).toEqual([{ precision: null, query: 'Grasse, Alpes-Maritimes, France' }]);
  });

  it('construit la cascade complète du plus précis au plus général pour une adresse entière', () => {
    const place = {
      street_number: '12', street_name: 'Rue de la Paix', building_name: '',
      arrondissement: '', city: 'Paris', postal_code: '75002',
      department: 'Paris', region: 'Île-de-France', country: 'France',
    };
    const levels = buildGeocodeLevels(place);
    expect(levels.map((l) => l.precision)).toEqual(['street', 'city', 'region', 'country']);
    expect(levels[0].query).toBe('12 Rue de la Paix, 75002 Paris, Île-de-France, France');
    expect(levels[levels.length - 1]).toEqual({ precision: 'country', query: 'France' });
  });

  it('omet le département quand il est identique à la ville (cas Paris/Lyon/Marseille)', () => {
    const place = {
      city: 'Paris', postal_code: '75006', arrondissement: '6e arrondissement',
      department: 'Paris', region: 'Île-de-France', country: 'France',
    };
    const levels = buildGeocodeLevels(place);
    expect(levels.map((l) => l.precision)).toEqual(['arrondissement', 'city', 'region', 'country']);
  });

  it('un seul champ renseigné (pays seul) donne un seul niveau', () => {
    const place = { country: 'France' };
    expect(buildGeocodeLevels(place)).toEqual([{ precision: 'country', query: 'France' }]);
  });

  it('chaque niveau retire le champ le plus précis tout en gardant les suivants', () => {
    const place = { city: 'Cagnes-sur-Mer', department: 'Alpes-Maritimes', country: 'France' };
    const levels = buildGeocodeLevels(place);
    expect(levels).toEqual([
      { precision: 'city', query: 'Cagnes-sur-Mer, Alpes-Maritimes, France' },
      { precision: 'department', query: 'Alpes-Maritimes, France' },
      { precision: 'country', query: 'France' },
    ]);
  });
});

describe('isApproximateGeocodePrecision', () => {
  it('signale département, région et pays comme approximatifs', () => {
    expect(isApproximateGeocodePrecision('department')).toBe(true);
    expect(isApproximateGeocodePrecision('region')).toBe(true);
    expect(isApproximateGeocodePrecision('country')).toBe(true);
  });

  it('ne signale pas une commune, une adresse précise ou une correspondance historique', () => {
    expect(isApproximateGeocodePrecision('city')).toBe(false);
    expect(isApproximateGeocodePrecision('street')).toBe(false);
    expect(isApproximateGeocodePrecision('alias')).toBe(false);
    expect(isApproximateGeocodePrecision(null)).toBe(false);
  });
});
