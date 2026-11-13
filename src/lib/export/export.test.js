import { describe, it, expect } from 'vitest';
import { buildGedcomText, formatGedcomDate } from './gedcomExporter.js';
import { buildJsonBackup } from './jsonExporter.js';

function makeSnapshot() {
  // Généalogie de test : ind1 + ind2 (grands-parents, décédés) -> ind3
  // (parent, décédé) ; ind3 + ind4 (conjointe vivante, née il y a < 100
  // ans, sans date de décès -> doit être masquée) -> ind5 (enfant, vivant).
  const individuals = [
    { id: 'ind1', firstNames: 'Louis', lastName: 'Martin', sex: 'M', birthDate: '1900-03-04', birthDatePrecision: 'exact', birthPlaceId: 'place1', deathDate: '1975-01-01', deathDatePrecision: 'exact', deathPlaceId: null, isDeceased: true, occupation: 'Agriculteur', biography: null },
    { id: 'ind2', firstNames: 'Marie', lastName: 'Martin', sex: 'F', birthDate: '1905-06-01', birthDatePrecision: 'about', birthPlaceId: null, deathDate: '1980-01-01', deathDatePrecision: 'exact', deathPlaceId: null, isDeceased: true, occupation: null, biography: null },
    { id: 'ind3', firstNames: 'Jean', lastName: 'Martin', sex: 'M', birthDate: '1930-07-10', birthDatePrecision: 'exact', birthPlaceId: null, deathDate: '2000-01-01', deathDatePrecision: 'exact', deathPlaceId: null, isDeceased: true, occupation: null, biography: null },
    { id: 'ind4', firstNames: 'Alice', lastName: 'Durand', sex: 'F', birthDate: '2000-01-01', birthDatePrecision: 'exact', birthPlaceId: null, deathDate: null, deathDatePrecision: 'unknown', deathPlaceId: null, isDeceased: false, occupation: null, biography: null },
    { id: 'ind5', firstNames: 'Léa', lastName: 'Martin', sex: 'F', birthDate: '2020-05-05', birthDatePrecision: 'exact', birthPlaceId: null, deathDate: null, deathDatePrecision: 'unknown', deathPlaceId: null, isDeceased: false, occupation: null, biography: null },
  ];

  const unions = [
    { id: 'u1', unionType: 'marriage', status: 'ongoing', startDate: '1925-01-01', startDatePrecision: 'exact', endDate: null, endDatePrecision: 'unknown', placeId: null, notes: null, partners: [{ individualId: 'ind1' }, { individualId: 'ind2' }] },
    { id: 'u2', unionType: 'marriage', status: 'ongoing', startDate: '1955-01-01', startDatePrecision: 'exact', endDate: null, endDatePrecision: 'unknown', placeId: null, notes: null, partners: [{ individualId: 'ind3' }, { individualId: 'ind4' }] },
  ];

  const filiations = [
    { id: 'f1', childId: 'ind3', parentId: 'ind1', unionId: 'u1', filiationType: 'biological' },
    { id: 'f2', childId: 'ind3', parentId: 'ind2', unionId: 'u1', filiationType: 'biological' },
    { id: 'f3', childId: 'ind5', parentId: 'ind3', unionId: 'u2', filiationType: 'biological' },
    { id: 'f4', childId: 'ind5', parentId: 'ind4', unionId: 'u2', filiationType: 'adoption_plenary' },
  ];

  const placesById = new Map([['place1', { id: 'place1', raw_label: 'Grasse, France' }]]);

  return {
    treeId: 'tree1',
    individuals,
    unions,
    filiations,
    places: [...placesById.values()],
    placesById,
    events: [],
    sources: [{ id: 'source-abcdef12', title: 'Registre de Grasse', repository: 'AD 06', notes: null }],
    citations: [],
    media: [],
    pets: [],
    petLinks: [],
  };
}

describe('formatGedcomDate', () => {
  it('formate une date exacte', () => {
    expect(formatGedcomDate({ date: '1930-07-10', datePrecision: 'exact' })).toBe('10 JUL 1930');
  });
  it('formate une date approximative', () => {
    expect(formatGedcomDate({ date: '1905-06-01', datePrecision: 'about' })).toBe('ABT 1 JUN 1905');
  });
  it('formate un intervalle', () => {
    expect(formatGedcomDate({ date: '1900-01-01', dateEnd: '1905-01-01', datePrecision: 'between' })).toBe('BET 1 JAN 1900 AND 1 JAN 1905');
  });
  it('retourne null sans date', () => {
    expect(formatGedcomDate({ date: null })).toBeNull();
  });
});

describe('buildGedcomText', () => {
  it('exporte tous les individus et familles avec l\'arbre complet', () => {
    const text = buildGedcomText(makeSnapshot(), { maskLiving: false, scope: { mode: 'all' } });
    expect(text).toContain('0 HEAD');
    expect(text).toContain('0 TRLR');
    expect(text).toContain('1 NAME Louis /Martin/');
    expect(text).toContain('1 NAME Alice /Durand/');
    expect(text).toContain('1 NAME Léa /Martin/');
    expect(text.match(/0 @I\d+@ INDI/g)).toHaveLength(5);
    expect(text.match(/0 @F\d+@ FAM/g)).toHaveLength(2);
    expect(text).toContain('0 @S');
    expect(text).toContain('1 TITL Registre de Grasse');
  });

  it('masque les personnes vivantes quand demandé', () => {
    const text = buildGedcomText(makeSnapshot(), { maskLiving: true, scope: { mode: 'all' } });
    expect(text).toContain('1 NAME Vivant /Masqué/');
    expect(text).not.toContain('Alice /Durand/');
    expect(text).not.toContain('Léa /Martin/');
    // Les personnes décédées ne sont jamais masquées.
    expect(text).toContain('1 NAME Louis /Martin/');
  });

  it('filtre sur les descendants d\'une racine', () => {
    const text = buildGedcomText(makeSnapshot(), { maskLiving: false, scope: { mode: 'descendants', rootId: 'ind1' } });
    expect(text).toContain('Louis /Martin/');
    expect(text).toContain('Jean /Martin/');
    expect(text).toContain('Léa /Martin/');
    expect(text).not.toContain('Marie /Martin/'); // conjointe, pas descendante
    expect(text).not.toContain('Alice /Durand/');
  });

  it('filtre sur les ascendants d\'une racine', () => {
    const text = buildGedcomText(makeSnapshot(), { maskLiving: false, scope: { mode: 'ascendants', rootId: 'ind3' } });
    expect(text).toContain('Jean /Martin/');
    expect(text).toContain('Louis /Martin/');
    expect(text).toContain('Marie /Martin/');
    expect(text).not.toContain('Alice /Durand/'); // conjointe, pas ascendante
    expect(text).not.toContain('Léa /Martin/'); // descendante, pas ascendante
  });

  it('indique la filiation adoptive via PEDI', () => {
    const text = buildGedcomText(makeSnapshot(), { maskLiving: false, scope: { mode: 'all' } });
    expect(text).toContain('2 PEDI adopted');
  });
});

describe('buildJsonBackup', () => {
  it('reprend toutes les tables de l\'instantané', () => {
    const backup = buildJsonBackup(makeSnapshot());
    expect(backup.format).toBe('arbre-et-memoire-backup');
    expect(backup.individuals).toHaveLength(5);
    expect(backup.unions).toHaveLength(2);
    expect(backup.filiations).toHaveLength(4);
    expect(backup.sources).toHaveLength(1);
    expect(backup.exportedAt).toBeTruthy();
  });
});
