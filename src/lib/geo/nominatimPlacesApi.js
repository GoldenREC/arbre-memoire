/**
 * Client Nominatim (OpenStreetMap, gratuit, sans clé) pour l'autocomplétion
 * des lieux dans les pays sans API administrative dédiée (voir
 * countryProfiles.js) : Belgique, Espagne, Portugal, Luxembourg, Grèce.
 * Même contrat que banAddressApi.js : jamais d'exception, un tableau vide
 * en cas d'erreur, la saisie manuelle reste toujours possible.
 *
 * Politique d'usage Nominatim : 1 requête/seconde max, s'identifier si
 * possible (voir CONTACT_EMAIL, même convention que lib/geo/geocoder.js).
 * Ce client ne fait qu'une requête par frappe (débouncée 300ms côté UI),
 * donc pas de boucle à espacer ici — contrairement à geocoder.js qui
 * enchaîne plusieurs niveaux de repli pour un même lieu.
 */
const BASE_URL = 'https://nominatim.openstreetmap.org/search';
const CONTACT_EMAIL = ''; // optionnel, voir geocoder.js

function cityOf(address) {
  return address.city || address.town || address.village || address.municipality
    || address.city_district || '';
}

function parseResult(item, countryLabel) {
  const a = item?.address || {};
  return {
    label: item.display_name || cityOf(a),
    city: cityOf(a),
    postalCode: a.postcode || '',
    department: a.county || a.state_district || a.region || '',
    arrondissement: a.city_district || a.district || '',
    region: a.state || '',
    country: countryLabel,
    latitude: item.lat ? Number(item.lat) : null,
    longitude: item.lon ? Number(item.lon) : null,
  };
}

/** Suggestions de lieux pour un pays donné (code ISO 2 lettres), à partir du texte tapé. */
export async function searchPlaces(countryCode, countryLabel, query, { limit = 6 } = {}) {
  const trimmed = query?.trim();
  if (!trimmed) return [];
  try {
    const params = new URLSearchParams({
      q: trimmed,
      format: 'jsonv2',
      addressdetails: '1',
      countrycodes: countryCode,
      'accept-language': 'fr',
      limit: String(limit),
    });
    if (CONTACT_EMAIL) params.set('email', CONTACT_EMAIL);
    const res = await fetch(`${BASE_URL}?${params.toString()}`);
    if (!res.ok) return [];
    const data = await res.json();
    return (Array.isArray(data) ? data : []).map((item) => parseResult(item, countryLabel));
  } catch {
    return [];
  }
}

// Exportée pour les tests unitaires (logique pure, sans réseau).
export const __test__ = { parseResult, cityOf };
