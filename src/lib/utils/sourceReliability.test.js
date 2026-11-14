import { describe, it, expect } from 'vitest';
import { isUnreliableSourceUrl, SOURCE_TYPES, SOURCE_TYPE_LABELS } from './sourceReliability.js';

describe('isUnreliableSourceUrl', () => {
  it('détecte les sites d\'arbres collaboratifs connus', () => {
    expect(isUnreliableSourceUrl('https://www.geneanet.org/fonds/individus/?nom=Dupont')).toBe(true);
    expect(isUnreliableSourceUrl('https://www.myheritage.fr/person-123')).toBe(true);
    expect(isUnreliableSourceUrl('https://www.ancestry.co.uk/family-tree/person/tree/1')).toBe(true);
    expect(isUnreliableSourceUrl('https://www.familysearch.org/tree/person/details/ABCD-123')).toBe(true);
  });

  it('ignore le "www." et la casse', () => {
    expect(isUnreliableSourceUrl('https://GENEANET.org/')).toBe(true);
  });

  it('ne signale pas un permalien d\'archive départementale', () => {
    expect(isUnreliableSourceUrl('https://archives.alpes-maritimes.fr/ark:/36937/vta123')).toBe(false);
  });

  it('ne signale pas un sous-domaine non pertinent du même nom', () => {
    expect(isUnreliableSourceUrl('https://not-geneanet.org/')).toBe(false);
  });

  it('renvoie false pour une URL vide, absente ou invalide', () => {
    expect(isUnreliableSourceUrl('')).toBe(false);
    expect(isUnreliableSourceUrl(null)).toBe(false);
    expect(isUnreliableSourceUrl(undefined)).toBe(false);
    expect(isUnreliableSourceUrl('pas une url')).toBe(false);
  });
});

describe('SOURCE_TYPES', () => {
  it('expose exactement les 3 types attendus', () => {
    expect(SOURCE_TYPES.map((t) => t.value)).toEqual(['archive_permalink', 'civil_record', 'family_data']);
  });

  it('SOURCE_TYPE_LABELS couvre chaque valeur de SOURCE_TYPES', () => {
    for (const t of SOURCE_TYPES) expect(SOURCE_TYPE_LABELS[t.value]).toBe(t.label);
  });
});
