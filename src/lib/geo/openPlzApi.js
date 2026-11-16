/**
 * Client pour l'API OpenPLZ (openplzapi.org), gratuite et sans clé,
 * utilisée pour l'autocomplétion des lieux en Allemagne et en Suisse
 * (voir countryProfiles.js). Même contrat que banAddressApi.js : jamais
 * d'exception, un tableau vide en cas d'erreur, la saisie manuelle reste
 * toujours possible.
 *
 * Documentation : https://www.openplzapi.org
 * - /de/Localities?name=...  ou  ?postalCode=...  (Allemagne)
 * - /ch/Localities?name=...  ou  ?postalCode=...  (Suisse)
 *
 * Réponse Allemagne : { postalCode, name, municipality: { name, type },
 * district?: { name, type: "Landkreis" }, federalState: { name } }.
 * `district` est absent pour les villes-arrondissements ("Kreisfreie
 * Stadt") : municipality fait alors aussi office de district urbain.
 *
 * Réponse Suisse : { postalCode, name, commune: { name }, district:
 * { name }, canton: { name } }.
 */
const BASE_URL = 'https://openplzapi.org';

function parseFeatureDE(item) {
  const isKreisfrei = item?.municipality?.type === 'Kreisfreie Stadt';
  return {
    label: `${item.name}${item.postalCode ? ` (${item.postalCode})` : ''}`,
    city: item.name || '',
    postalCode: item.postalCode || '',
    department: isKreisfrei ? '' : (item.district?.name || ''),
    arrondissement: isKreisfrei ? (item.municipality?.name || '') : '',
    region: item.federalState?.name || '',
    country: 'Allemagne',
    latitude: null,
    longitude: null,
  };
}

function parseFeatureCH(item) {
  return {
    label: `${item.name}${item.postalCode ? ` (${item.postalCode})` : ''}`,
    city: item.commune?.name || item.name || '',
    postalCode: item.postalCode || '',
    department: item.district?.name || '',
    arrondissement: '',
    region: item.canton?.name || '',
    country: 'Suisse',
    latitude: null,
    longitude: null,
  };
}

const PARSERS = { de: parseFeatureDE, ch: parseFeatureCH };

async function fetchLocalities(countryCode, params, { limit = 8 } = {}) {
  const parse = PARSERS[countryCode];
  if (!parse) return [];
  try {
    const qs = new URLSearchParams({ ...params, page: '1', pageSize: String(limit) });
    const res = await fetch(`${BASE_URL}/${countryCode}/Localities?${qs.toString()}`);
    if (!res.ok) return [];
    const data = await res.json();
    return (Array.isArray(data) ? data : []).map(parse);
  } catch {
    return []; // pas de réseau, API indisponible... la saisie manuelle prend le relais.
  }
}

/** Suggestions de communes correspondant au texte tapé, pour 'de' ou 'ch'. */
export function searchLocalities(countryCode, query, options) {
  const trimmed = query?.trim();
  if (!trimmed) return Promise.resolve([]);
  return fetchLocalities(countryCode, { name: trimmed }, options);
}

/** Suggestions pour un code postal tapé directement, pour 'de' ou 'ch'. */
export function searchLocalitiesByPostalCode(countryCode, postalCode, options) {
  const trimmed = postalCode?.trim();
  if (!trimmed) return Promise.resolve([]);
  return fetchLocalities(countryCode, { postalCode: trimmed }, options);
}

// Exportées pour les tests unitaires (logique pure, sans réseau).
export const __test__ = { parseFeatureDE, parseFeatureCH };
