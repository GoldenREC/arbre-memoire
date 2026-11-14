import { describe, it, expect } from 'vitest';
import { composePlaceLabel, EMPTY_PLACE } from './StructuredPlaceInput.jsx';

describe('composePlaceLabel', () => {
  it('compose un libellé complet à partir de tous les champs', () => {
    const place = {
      streetNumber: '12', streetName: 'Rue de la Paix', buildingName: '',
      arrondissement: '', city: 'Paris', postalCode: '75002',
      department: 'Paris', region: 'Île-de-France', country: 'France',
    };
    expect(composePlaceLabel(place)).toBe('12 Rue de la Paix, 75002 Paris, Île-de-France, France');
  });

  it('omet le département quand il est identique à la ville (cas Paris/Lyon/Marseille)', () => {
    const place = {
      ...EMPTY_PLACE, city: 'Paris', postalCode: '75006', arrondissement: '6e arrondissement',
      department: 'Paris', region: 'Île-de-France', country: 'France',
    };
    expect(composePlaceLabel(place)).toBe('6e arrondissement, 75006 Paris, Île-de-France, France');
  });

  it('ignore les champs vides sans laisser de virgules orphelines', () => {
    expect(composePlaceLabel({ ...EMPTY_PLACE, city: 'Cagnes-sur-Mer', country: 'France' })).toBe('Cagnes-sur-Mer, France');
  });

  it('renvoie une chaîne vide quand tout est vide', () => {
    expect(composePlaceLabel(EMPTY_PLACE)).toBe('');
  });
});
