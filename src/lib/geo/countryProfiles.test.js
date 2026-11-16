import { describe, it, expect } from 'vitest';
import { COUNTRY_PROFILES, getCountryProfile, GENERIC_PROFILE } from './countryProfiles.js';

describe('COUNTRY_PROFILES', () => {
  it('couvre les 9 pays demandés avec des libellés complets pour les 8 champs', () => {
    const expectedIds = ['France', 'Allemagne', 'Suisse', 'Belgique', 'Angleterre', 'Espagne', 'Portugal', 'Luxembourg', 'Grèce'];
    expect(COUNTRY_PROFILES.map((p) => p.id).sort()).toEqual([...expectedIds].sort());

    const requiredLabelKeys = [
      'region', 'department', 'postalCode', 'city', 'arrondissement', 'buildingName', 'streetName', 'streetNumber',
    ];
    for (const profile of COUNTRY_PROFILES) {
      for (const key of requiredLabelKeys) {
        expect(profile.labels[key], `${profile.id}.labels.${key}`).toBeTruthy();
      }
      expect(typeof profile.search).toBe('function');
    }
  });

  it('utilise bien les libellés français fournis par l\'utilisateur pour la France et l\'Allemagne', () => {
    const france = getCountryProfile('France');
    expect(france.labels).toMatchObject({
      region: 'Région', department: 'Département', postalCode: 'Code postal', city: 'Commune / ville',
      arrondissement: 'Arrondissement', buildingName: 'Bâtiment / lieu-dit', streetName: 'Nom de la rue', streetNumber: 'Numéro de rue',
    });
    const allemagne = getCountryProfile('Allemagne');
    expect(allemagne.labels.region).toBe('État fédéré');
    expect(allemagne.labels.postalCode).toBe('Code postal');
    expect(allemagne.labels.city).toBe('Commune / ville');
    expect(allemagne.labels.streetName).toBe('Rue');
    expect(allemagne.labels.streetNumber).toBe('Numéro de maison');
  });
});

describe('getCountryProfile', () => {
  it('renvoie le profil générique pour un pays inconnu ou vide', () => {
    expect(getCountryProfile('')).toBe(GENERIC_PROFILE);
    expect(getCountryProfile('Atlantide')).toBe(GENERIC_PROFILE);
    expect(getCountryProfile(undefined)).toBe(GENERIC_PROFILE);
  });

  it('le profil générique ne force aucune autocomplétion', () => {
    expect(GENERIC_PROFILE.search).toBeNull();
    expect(GENERIC_PROFILE.searchByPostcode).toBeNull();
  });
});
