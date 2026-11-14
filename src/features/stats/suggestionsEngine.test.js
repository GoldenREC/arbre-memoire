import { describe, it, expect } from 'vitest';
import { detectSurnameInconsistencies, detectPlaceInconsistencies } from './suggestionsEngine.js';

describe('detectSurnameInconsistencies', () => {
  it("suggère une correction quand l'orthographe de l'enfant est rare face à celle, dominante, du parent", () => {
    const individuals = [
      { id: 'parent', firstNames: 'Charles-Louis', lastName: 'Ternay' },
      { id: 'child', firstNames: 'Jean', lastName: 'Cernay' },
      // Neuf autres "Ternay" pour établir la dominance de cette orthographe.
      ...Array.from({ length: 9 }, (_, i) => ({ id: `t${i}`, firstNames: 'X', lastName: 'Ternay' })),
    ];
    const filiations = [{ childId: 'child', parentId: 'parent', filiationType: 'biological' }];
    const findings = detectSurnameInconsistencies(individuals, filiations);
    expect(findings).toHaveLength(1);
    expect(findings[0].kind).toBe('surname_mismatch');
    expect(findings[0].suggestion).toMatchObject({ type: 'rename_individual', individualId: 'child', from: 'Cernay', to: 'Ternay' });
  });

  it('ne suggère rien pour une filiation adoptive (nom différent légitime)', () => {
    const individuals = [
      { id: 'parent', firstNames: 'Gilles', lastName: 'Tochou' },
      { id: 'child', firstNames: 'Loick', lastName: 'Tochet' },
      ...Array.from({ length: 9 }, (_, i) => ({ id: `t${i}`, firstNames: 'X', lastName: 'Tochou' })),
    ];
    const filiations = [{ childId: 'child', parentId: 'parent', filiationType: 'adoption_simple' }];
    expect(detectSurnameInconsistencies(individuals, filiations)).toHaveLength(0);
  });

  it('ne suggère rien quand les deux orthographes sont également répandues', () => {
    const individuals = [
      { id: 'parent', firstNames: 'A', lastName: 'Martin' },
      { id: 'child', firstNames: 'B', lastName: 'Martln' },
      { id: 'c1', firstNames: 'C', lastName: 'Martin' },
      { id: 'c2', firstNames: 'D', lastName: 'Martln' },
    ];
    const filiations = [{ childId: 'child', parentId: 'parent', filiationType: 'biological' }];
    expect(detectSurnameInconsistencies(individuals, filiations)).toHaveLength(0);
  });

  it('ne suggère rien pour deux noms totalement différents', () => {
    const individuals = [
      { id: 'parent', firstNames: 'A', lastName: 'Dupont' },
      { id: 'child', firstNames: 'B', lastName: 'Rougier' },
      ...Array.from({ length: 5 }, (_, i) => ({ id: `t${i}`, firstNames: 'X', lastName: 'Dupont' })),
    ];
    const filiations = [{ childId: 'child', parentId: 'parent', filiationType: 'biological' }];
    expect(detectSurnameInconsistencies(individuals, filiations)).toHaveLength(0);
  });
});

describe('detectPlaceInconsistencies', () => {
  it('suggère une fusion quand une orthographe de lieu est rare face à une orthographe proche et dominante dans la même région', () => {
    const places = [
      { id: 'dominant', rawLabel: 'Châteauponsac, Haute-Vienne, France', region: 'Nouvelle-Aquitaine', country: 'France' },
      { id: 'rare', rawLabel: 'Chateauponssac, Haute-Vienne, France', region: 'Nouvelle-Aquitaine', country: 'France' },
    ];
    const usage = new Map([['dominant', 9], ['rare', 1]]);
    const findings = detectPlaceInconsistencies(places, usage);
    expect(findings).toHaveLength(1);
    expect(findings[0].kind).toBe('place_mismatch');
    expect(findings[0].suggestion).toMatchObject({ type: 'merge_place', keepPlaceId: 'dominant', removePlaceId: 'rare' });
  });

  it('ignore deux lieux de régions différentes même si les libellés se ressemblent', () => {
    const places = [
      { id: 'a', rawLabel: 'Grasse, Alpes-Maritimes, France', region: 'Provence-Alpes-Côte d\'Azur', country: 'France' },
      { id: 'b', rawLabel: 'Grassy, Centre-Val de Loire, France', region: 'Centre-Val de Loire', country: 'France' },
    ];
    const usage = new Map([['a', 10], ['b', 1]]);
    expect(detectPlaceInconsistencies(places, usage)).toHaveLength(0);
  });

  it('ignore les lieux identiques', () => {
    const places = [
      { id: 'a', rawLabel: 'Tours, Indre-et-Loire, France' },
      { id: 'b', rawLabel: 'Tours, Indre-et-Loire, France' },
    ];
    const usage = new Map([['a', 5], ['b', 5]]);
    expect(detectPlaceInconsistencies(places, usage)).toHaveLength(0);
  });

  it('ignore une variante rare sans usage dominant suffisant', () => {
    const places = [
      { id: 'a', rawLabel: 'Donzenac, Corrèze, France', region: 'Nouvelle-Aquitaine' },
      { id: 'b', rawLabel: 'Donzenac2, Corrèze, France', region: 'Nouvelle-Aquitaine' },
    ];
    const usage = new Map([['a', 2], ['b', 1]]); // ratio insuffisant (< 3x)
    expect(detectPlaceInconsistencies(places, usage)).toHaveLength(0);
  });
});
