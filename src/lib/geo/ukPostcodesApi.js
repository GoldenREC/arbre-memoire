/**
 * Client pour l'API postcodes.io, gratuite et sans clé, utilisée pour
 * l'autocomplétion des lieux au Royaume-Uni / Angleterre (voir
 * countryProfiles.js). Même contrat que banAddressApi.js : jamais
 * d'exception, un tableau vide en cas d'erreur, la saisie manuelle reste
 * toujours possible.
 *
 * Documentation : https://postcodes.io
 * - /places?q=...        -> autocomplétion par nom de lieu
 * - /postcodes/{code}    -> détail d'un postcode précis
 */
const BASE_URL = 'https://api.postcodes.io';

function parsePlace(p) {
  return {
    label: `${p.name_1}${p.name_2 ? `, ${p.name_2}` : ''}`,
    city: p.name_1 || '',
    postalCode: p.outcode || '',
    department: p.county_unitary || p.district_borough || '',
    arrondissement: p.district_borough && p.district_borough !== p.county_unitary ? p.district_borough : '',
    region: p.region || '',
    country: 'Angleterre',
    latitude: typeof p.latitude === 'number' ? p.latitude : null,
    longitude: typeof p.longitude === 'number' ? p.longitude : null,
  };
}

function parsePostcode(p) {
  return {
    label: p.postcode || '',
    city: p.admin_ward || p.parish || '',
    postalCode: p.postcode || '',
    department: p.admin_county || p.admin_district || '',
    arrondissement: p.admin_district && p.admin_district !== p.admin_county ? p.admin_district : '',
    region: p.region || '',
    country: 'Angleterre',
    latitude: typeof p.latitude === 'number' ? p.latitude : null,
    longitude: typeof p.longitude === 'number' ? p.longitude : null,
  };
}

/** Suggestions de lieux correspondant au texte tapé (nom de ville/localité). */
export async function searchPlaces(query, { limit = 8 } = {}) {
  const trimmed = query?.trim();
  if (!trimmed) return [];
  try {
    const url = `${BASE_URL}/places?q=${encodeURIComponent(trimmed)}&limit=${limit}`;
    const res = await fetch(url);
    if (!res.ok) return [];
    const data = await res.json();
    return (data.result || []).map(parsePlace);
  } catch {
    return [];
  }
}

/** Suggestion pour un postcode tapé directement (recherche exacte, normalisée en espaces). */
export async function searchByPostcode(postcode) {
  const trimmed = postcode?.trim().replace(/\s+/g, '');
  if (!trimmed || trimmed.length < 5) return [];
  try {
    const res = await fetch(`${BASE_URL}/postcodes/${encodeURIComponent(trimmed)}`);
    if (!res.ok) return [];
    const data = await res.json();
    return data.result ? [parsePostcode(data.result)] : [];
  } catch {
    return [];
  }
}

// Exportées pour les tests unitaires (logique pure, sans réseau).
export const __test__ = { parsePlace, parsePostcode };
