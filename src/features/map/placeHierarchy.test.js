import { describe, it, expect } from 'vitest';
import { groupPlacesByHierarchy, countCities } from './placeHierarchy.js';

const place = (id, city, department, region, country, extra = {}) => ({ id, city, department, region, country, latitude: 1, longitude: 2, ...extra });

describe('groupPlacesByHierarchy', () => {
  const places = [
    place('p1', 'Paris', 'Paris', 'Île-de-France', 'France'),
    place('p2', 'Paris', 'Paris', 'Île-de-France', 'France', { latitude: 9, longitude: 9 }), // autre rue de la même commune
    place('p3', 'Herblay', "Val-d'Oise", 'Île-de-France', 'France'),
    place('p4', 'Gubbio', null, 'Ombrie', 'Italie'),
    place('p5', 'Lyon', 'Rhône', 'Auvergne-Rhône-Alpes', 'France', { latitude: null }), // non géocodé : ignoré
  ];
  const tree = groupPlacesByHierarchy(places, new Map([['p1', 3], ['p2', 2], ['p3', 1], ['p4', 4]]));

  it('range par pays, région, département puis commune, triés par nom', () => {
    expect(tree.map((c) => c.name)).toEqual(['France', 'Italie']);
    const idf = tree[0].regions[0];
    expect(idf.name).toBe('Île-de-France');
    expect(idf.departments.map((d) => d.name)).toEqual(['Paris', "Val-d'Oise"]);
  });

  it("s'arrête à la commune : deux adresses de Paris ne font qu'une ligne, événements additionnés", () => {
    const paris = tree[0].regions[0].departments[0].cities;
    expect(paris).toHaveLength(1);
    expect(paris[0]).toMatchObject({ name: 'Paris', count: 5, placeCount: 2, point: { latitude: 1, longitude: 2 } });
    expect(tree[0].count).toBe(6);
  });

  it('nomme les niveaux manquants et ignore les lieux non géocodés', () => {
    expect(tree[1].regions[0].departments[0].name).toBe('Département non renseigné');
    expect(countCities(tree)).toBe(3);
  });
});
