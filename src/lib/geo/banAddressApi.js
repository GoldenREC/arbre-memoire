/**
 * Client pour l'API Adresse du gouvernement français (Base Adresse
 * Nationale — api-adresse.data.gouv.fr), gratuite et sans clé. Sert
 * l'autocomplétion du composant StructuredPlaceInput : taper une
 * commune ou un code postal propose les correspondances, et en choisir
 * une pré-remplit commune/code postal/département/région/pays/
 * arrondissement (déduits), sans jamais toucher aux champs qu'elle ne
 * peut pas connaître (numéro de rue, nom de rue, bâtiment).
 *
 * Ne lève jamais d'exception : en cas d'erreur réseau ou de réponse
 * inattendue, renvoie un tableau vide — la saisie manuelle reste
 * toujours possible, l'autocomplétion n'est qu'une aide.
 */
const BASE_URL = 'https://api-adresse.data.gouv.fr/search/';

/**
 * Découpe le "context" renvoyé par l'API (ex: "06, Alpes-Maritimes,
 * Provence-Alpes-Côte d'Azur") en { department, region }. Le format
 * standard a 3 éléments (code dépt, nom dépt, nom région) ; certains
 * territoires n'en ont que 2, auquel cas on reprend le 2e élément pour
 * les deux plutôt que de laisser la région vide.
 */
function parseContext(context) {
  if (!context) return { department: '', region: '' };
  const parts = context.split(',').map((p) => p.trim()).filter(Boolean);
  if (parts.length >= 3) return { department: parts[1], region: parts[2] };
  if (parts.length === 2) return { department: parts[1], region: parts[1] };
  return { department: '', region: '' };
}

/** Extrait "6e Arrondissement" etc. du nom d'une commune-arrondissement (Paris/Lyon/Marseille), sinon ''. */
function parseArrondissement(name) {
  const m = /(\d+)(e|er)?\s+Arrondissement/i.exec(name || '');
  return m ? `${m[1]}${m[2] === 'er' ? 'er' : 'e'} arrondissement` : '';
}

function parseFeature(feature) {
  const p = feature?.properties || {};
  const [longitude, latitude] = feature?.geometry?.coordinates || [null, null];
  const { department, region } = parseContext(p.context);
  return {
    label: p.label || '',
    city: p.city || '',
    postalCode: p.postcode || '',
    citycode: p.citycode || '',
    department,
    region,
    country: 'France',
    arrondissement: parseArrondissement(p.name),
    latitude,
    longitude,
  };
}

async function search(query, { limit = 5, extraParams = '' } = {}) {
  const trimmed = query?.trim();
  if (!trimmed) return [];
  try {
    const url = `${BASE_URL}?q=${encodeURIComponent(trimmed)}&type=municipality&autocomplete=1&limit=${limit}${extraParams}`;
    const res = await fetch(url);
    if (!res.ok) return [];
    const data = await res.json();
    return (data.features || []).map(parseFeature);
  } catch {
    return []; // pas de réseau, API indisponible... la saisie manuelle prend le relais.
  }
}

/** Suggestions de communes correspondant au texte tapé (nom de ville). */
export function searchCommunes(query, options) {
  return search(query, options);
}

/** Suggestions pour un code postal tapé directement (ex: "75006" -> Paris 6e Arrondissement). */
export function searchByPostcode(postcode, options) {
  return search(postcode, options);
}

// Exportées pour les tests unitaires (logique pure, sans réseau).
export const __test__ = { parseContext, parseArrondissement, parseFeature };
