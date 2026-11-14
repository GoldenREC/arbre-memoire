/**
 * Lieux géocodés rangés par pays > région > département > commune, pour
 * le panneau "Lieux" de la carte. On s'arrête à la commune : les rues,
 * arrondissements et lieux-dits d'une même commune sont regroupés sous
 * elle. Fonction pure, testée.
 *
 * Chaque commune porte le nombre d'événements qui s'y déroulent et un
 * point (le premier lieu géocodé de la commune) pour y centrer la carte.
 */
import { regionOfFrenchDepartment } from '../../lib/geo/frenchDepartments.js';

const UNKNOWN = { country: 'Pays inconnu', region: 'Région non renseignée', department: 'Département non renseigné', city: 'Commune non renseignée' };

function sortedEntries(map) {
  // Les rubriques "non renseigné" / "inconnu" passent en dernier.
  const unknown = (n) => (Object.values(UNKNOWN).includes(n) ? 1 : 0);
  return [...map.values()].sort((a, b) => unknown(a.name) - unknown(b.name) || a.name.localeCompare(b.name, 'fr'));
}

export function groupPlacesByHierarchy(places, eventCountByPlaceId = new Map()) {
  const countries = new Map();
  const child = (map, name) => {
    if (!map.has(name)) map.set(name, { name, count: 0, children: new Map() });
    return map.get(name);
  };

  for (const p of places) {
    if (p.latitude == null || p.longitude == null) continue;
    const events = eventCountByPlaceId.get(p.id) || 0;
    // Seul le département est connu : s'il est français, sa région s'en déduit.
    const frenchRegion = regionOfFrenchDepartment(p.department);
    const country = child(countries, (p.country || '').trim() || (frenchRegion ? 'France' : UNKNOWN.country));
    const region = child(country.children, (p.region || '').trim() || frenchRegion || UNKNOWN.region);
    const department = child(region.children, (p.department || '').trim() || UNKNOWN.department);
    const city = child(department.children, (p.city || '').trim() || UNKNOWN.city);
    for (const node of [country, region, department, city]) node.count += events;
    if (!city.point) city.point = { latitude: p.latitude, longitude: p.longitude };
    city.placeCount = (city.placeCount || 0) + 1;
  }

  return sortedEntries(countries).map((country) => ({
    name: country.name,
    count: country.count,
    regions: sortedEntries(country.children).map((region) => ({
      name: region.name,
      count: region.count,
      departments: sortedEntries(region.children).map((department) => ({
        name: department.name,
        count: department.count,
        cities: sortedEntries(department.children).map((city) => ({
          name: city.name, count: city.count, placeCount: city.placeCount, point: city.point,
        })),
      })),
    })),
  }));
}

export function countCities(tree) {
  return tree.reduce((n, c) => n + c.regions.reduce((m, r) => m + r.departments.reduce((k, d) => k + d.cities.length, 0), 0), 0);
}
