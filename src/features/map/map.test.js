import { describe, it, expect } from 'vitest';
import { normalizePlaceLabel, resolveHistoricalAlias } from '../../lib/geo/geocoder.js';
import { categoryOf, pathColorAt } from './eventTypeStyles.js';
import { buildIndividualPath } from './mapData.js';

describe('normalizePlaceLabel', () => {
  it('retire les accents et met en minuscule', () => {
    expect(normalizePlaceLabel('Strasbourg, Alsace, France')).toBe('strasbourg, alsace, france');
    expect(normalizePlaceLabel('Mülhausen')).toBe('mulhausen');
  });
  it('gère une valeur vide', () => {
    expect(normalizePlaceLabel(null)).toBe('');
    expect(normalizePlaceLabel('')).toBe('');
  });
});

describe('resolveHistoricalAlias', () => {
  const aliases = [
    { pattern: 'strasbourg', year_start: 1871, year_end: 1918, latitude: 48.57, longitude: 7.75 },
    { pattern: 'lima', year_start: null, year_end: null, latitude: -12.0, longitude: -77.0 },
  ];

  it('trouve une correspondance dont la période couvre l\'année', () => {
    const match = resolveHistoricalAlias(aliases, 'Strasbourg, Alsace', 1900);
    expect(match).toBeTruthy();
    expect(match.latitude).toBeCloseTo(48.57);
  });

  it('ignore une correspondance hors période', () => {
    const match = resolveHistoricalAlias(aliases, 'Strasbourg, Alsace', 1950);
    expect(match).toBeNull();
  });

  it('matche une correspondance sans bornes de période à toute année', () => {
    const match = resolveHistoricalAlias(aliases, 'Lima, Pérou', 1600);
    expect(match).toBeTruthy();
  });

  it('ne matche rien si aucun motif ne correspond', () => {
    expect(resolveHistoricalAlias(aliases, 'Marseille, France', 1900)).toBeNull();
  });

  it('ignore une correspondance bornée dans le temps quand l\'année est inconnue (places partagé entre époques)', () => {
    expect(resolveHistoricalAlias(aliases, 'Strasbourg, Alsace', null)).toBeNull();
  });

  it('applique quand même une correspondance sans bornes quand l\'année est inconnue', () => {
    expect(resolveHistoricalAlias(aliases, 'Lima, Pérou', null)).toBeTruthy();
  });
});

describe('categoryOf', () => {
  it('classe les types connus', () => {
    expect(categoryOf('birth')).toBe('birth');
    expect(categoryOf('death')).toBe('death');
    expect(categoryOf('marriage')).toBe('marriage');
  });
  it('range tout le reste dans "other"', () => {
    expect(categoryOf('occupation')).toBe('other');
    expect(categoryOf('residence')).toBe('other');
    expect(categoryOf('custom')).toBe('other');
  });
});

describe('pathColorAt', () => {
  it('boucle sur la palette au-delà de sa taille', () => {
    const first = pathColorAt(0);
    const looped = pathColorAt(8); // la palette a 8 couleurs (index 0-7)
    expect(looped).toBe(first);
  });
});

describe('buildIndividualPath', () => {
  const events = [
    { id: 'e1', subjectKind: 'individual', subjectId: 'p1', year: 1950, latitude: 48.8, longitude: 2.3 },
    { id: 'e2', subjectKind: 'individual', subjectId: 'p1', year: 1948, latitude: 48.8, longitude: 2.3 }, // même lieu, antérieur
    { id: 'e3', subjectKind: 'individual', subjectId: 'p1', year: 1975, latitude: 43.7, longitude: 7.3 },
    { id: 'e4', subjectKind: 'individual', subjectId: 'p1', year: null, latitude: 0, longitude: 0 }, // sans année : ignoré
    { id: 'e5', subjectKind: 'individual', subjectId: 'p2', year: 1960, latitude: 10, longitude: 10 },
  ];

  it('trie chronologiquement et déduplique les lieux consécutifs identiques', () => {
    const path = buildIndividualPath(events, 'p1');
    expect(path.map((p) => p.id)).toEqual(['e2', 'e3']);
  });

  it('ignore les événements sans année', () => {
    const path = buildIndividualPath(events, 'p1');
    expect(path.find((p) => p.id === 'e4')).toBeUndefined();
  });

  it('ne mélange pas les personnes', () => {
    const path = buildIndividualPath(events, 'p2');
    expect(path.map((p) => p.id)).toEqual(['e5']);
  });
});
