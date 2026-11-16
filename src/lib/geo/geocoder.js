import { supabase } from '../supabaseClient.js';

/**
 * Résolution géographique des lieux, avec prise en compte des
 * toponymes historiques (1500-2026) : avant tout appel à un service
 * externe, on consulte la table de correspondance `historical_place_
 * aliases` (lieux-dits disparus, communes fusionnées, villes ayant
 * changé de nom/nationalité) propre à l'arbre — enrichissable depuis
 * le panneau "Lieux à résoudre" de la carte, sans toucher au code.
 *
 * Le géocodeur externe (Nominatim/OpenStreetMap, gratuit, sans clé) ne
 * sert qu'en repli, pour les lieux modernes ou non couverts par une
 * correspondance. Politique d'usage Nominatim : 1 requête/seconde max,
 * s'identifier si possible (voir CONTACT_EMAIL ci-dessous) — respectée
 * par geocodeAllPendingPlaces() qui espace ses appels.
 */
const NOMINATIM_URL = 'https://nominatim.openstreetmap.org/search';
// Base Adresse Nationale (service officiel français, sans clé) : reconnaît les
// numéros de rue, contrairement à Nominatim qui se perd sur « 46-48 ».
const BAN_SEARCH_URL = 'https://api-adresse.data.gouv.fr/search/';
// En dessous de ce score, la BAN propose une rue ou une commune proche plutôt que
// le numéro demandé : on ne l'utilise pas et on laisse Nominatim prendre le relais.
export const BAN_MIN_SCORE = 0.6;

/**
 * Numéros de rue à essayer, dans l'ordre : "46-48" → ["46", "48"], "46 bis" → ["46"],
 * "12" → ["12"], vide → []. Une plage désigne souvent un même bâtiment : on tente
 * chaque numéro plutôt que de renoncer.
 */
export function streetNumberCandidates(streetNumber) {
  const m = /^\s*(\d+)(?:\s*(?:-|–|\/|à|au)\s*(\d+))?/i.exec(String(streetNumber || ''));
  if (!m) return [];
  return m[2] ? [m[1], m[2]] : [m[1]];
}

// Renseigne une adresse de contact si tu en as une : Nominatim le demande
// par politesse pour un usage à plus de quelques requêtes (facultatif).
const CONTACT_EMAIL = '';

export function normalizePlaceLabel(label) {
  if (!label) return '';
  return label
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-zA-Z0-9\s,]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

/** Cherche une correspondance historique couvrant l'année donnée. */
export function resolveHistoricalAlias(aliases, rawLabel, year) {
  const normalized = normalizePlaceLabel(rawLabel);
  if (!normalized) return null;
  for (const alias of aliases) {
    const pattern = normalizePlaceLabel(alias.pattern);
    if (!pattern || !normalized.includes(pattern)) continue;
    const isUniversal = alias.year_start == null && alias.year_end == null;
    if (isUniversal) return alias;
    // Une correspondance bornée dans le temps (ex: "Strasbourg" entre
    // 1871 et 1918) ne doit jamais s'appliquer quand l'année de
    // l'événement est inconnue : un même nom de lieu (`places` est
    // partagé par tous les événements qui le citent) peut couvrir
    // plusieurs époques, mieux vaut alors laisser le géocodeur externe
    // trancher que risquer d'assigner la mauvaise période.
    if (year == null) continue;
    const afterStart = alias.year_start == null || year >= alias.year_start;
    const beforeEnd = alias.year_end == null || year <= alias.year_end;
    if (afterStart && beforeEnd) return alias;
  }
  return null;
}

export async function listHistoricalAliases(treeId) {
  const { data, error } = await supabase
    .from('historical_place_aliases')
    .select('*')
    .eq('tree_id', treeId)
    .order('pattern');
  if (error) throw error;
  return data || [];
}

export async function createHistoricalAlias(treeId, patch) {
  const { error } = await supabase.from('historical_place_aliases').insert({
    tree_id: treeId,
    pattern: patch.pattern,
    year_start: patch.yearStart ?? null,
    year_end: patch.yearEnd ?? null,
    canonical_label: patch.canonicalLabel,
    latitude: patch.latitude,
    longitude: patch.longitude,
    country: patch.country || null,
    region: patch.region || null,
    notes: patch.notes || null,
  });
  if (error) throw error;
}

export async function deleteHistoricalAlias(id) {
  const { error } = await supabase.from('historical_place_aliases').delete().eq('id', id);
  if (error) throw error;
}

/**
 * Niveaux de géocodage en cascade pour un lieu structuré (voir
 * supabase/places_structured.sql) : du plus précis (adresse complète —
 * numéro + rue, bâtiment/lieu-dit, arrondissement, commune/code postal,
 * département, région, pays) au plus général (pays seul). Chaque niveau
 * correspond à une requête Nominatim ; si l'API ne reconnaît pas le
 * niveau le plus précis (numéro de rue introuvable, lieu-dit disparu...),
 * geocodePlace() retire automatiquement ce niveau et retente avec le
 * niveau juste au-dessus, jusqu'au pays seul.
 *
 * Pour un lieu sans aucun champ structuré (import GEDCOM, ancien champ
 * libre), un seul niveau est renvoyé à partir de raw_label — exactement
 * le comportement d'avant cette fonctionnalité, précision inconnue
 * (`null`).
 */
export function buildGeocodeLevels(place) {
  const fields = [
    { precision: 'street', text: [place.street_number, place.street_name].filter(Boolean).join(' ') },
    { precision: 'building', text: place.building_name || '' },
    { precision: 'arrondissement', text: place.arrondissement || '' },
    { precision: 'city', text: [place.postal_code, place.city].filter(Boolean).join(' ') },
    { precision: 'department', text: place.department && place.department !== place.city ? place.department : '' },
    { precision: 'region', text: place.region && place.region !== place.department ? place.region : '' },
    { precision: 'country', text: place.country || '' },
  ].filter((f) => f.text);

  if (!fields.length) return [{ precision: null, query: place.raw_label }];

  return fields.map((_, i) => ({
    precision: fields[i].precision,
    query: fields.slice(i).map((f) => f.text).join(', '),
  }));
}

/** Libellés d'affichage des niveaux de précision — panneau "Lieux à résoudre" et marqueurs de la carte. */
export const GEOCODE_PRECISION_LABELS = {
  street: 'Adresse',
  building: 'Bâtiment / lieu-dit',
  arrondissement: 'Arrondissement',
  city: 'Commune',
  department: 'Département',
  region: 'Région',
  country: 'Pays',
  alias: 'Correspondance historique',
};

/**
 * Un pin "approximatif" (département, région ou pays seul) peut être
 * très loin du lieu réel — contrairement à une commune, qui reste une
 * précision tout à fait normale pour un acte généalogique. Sert à
 * distinguer visuellement ces cas sur la carte plutôt que de les
 * afficher comme n'importe quel autre pin résolu.
 */
export function isApproximateGeocodePrecision(precision) {
  return precision === 'department' || precision === 'region' || precision === 'country';
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Un seul appel à la BAN : renvoie les coordonnées si le score est suffisant, sinon null. */
async function geocodeViaBan(query) {
  const url = new URL(BAN_SEARCH_URL);
  url.searchParams.set('q', query);
  url.searchParams.set('limit', '1');
  const res = await fetch(url.toString());
  if (!res.ok) throw new Error(`BAN a répondu ${res.status}`);
  const data = await res.json();
  const feature = data.features?.[0];
  if (!feature || (feature.properties?.score ?? 0) < BAN_MIN_SCORE) return null;
  const [longitude, latitude] = feature.geometry?.coordinates || [];
  if (latitude == null || longitude == null) return null;
  return { latitude, longitude, displayName: feature.properties?.label || '' };
}

/** Un seul appel Nominatim — ne pas boucler sans délai (voir geocodeAllPendingPlaces). */
async function geocodeViaNominatim(query) {
  const url = new URL(NOMINATIM_URL);
  url.searchParams.set('format', 'json');
  url.searchParams.set('limit', '1');
  url.searchParams.set('q', query);
  url.searchParams.set('addressdetails', '1');
  url.searchParams.set('accept-language', 'fr');
  if (CONTACT_EMAIL) url.searchParams.set('email', CONTACT_EMAIL);

  const res = await fetch(url.toString(), { headers: { Accept: 'application/json' } });
  if (!res.ok) throw new Error(`Nominatim a répondu ${res.status}`);
  const results = await res.json();
  if (!results.length) return null;
  const best = results[0];
  return {
    latitude: parseFloat(best.lat),
    longitude: parseFloat(best.lon),
    country: best.address?.country || null,
    region: best.address?.state || best.address?.region || null,
    displayName: best.display_name,
  };
}

/**
 * Résout un lieu (ligne de la table `places`) : correspondance
 * historique si elle couvre l'année donnée, sinon cascade Nominatim du
 * niveau le plus précis au plus général (voir buildGeocodeLevels). Le
 * premier niveau qui obtient un résultat l'emporte ; un échec (erreur
 * réseau ou "non trouvé") sur un niveau ne fait pas échouer tout le
 * lieu, il passe simplement au niveau suivant, moins précis — ce n'est
 * qu'après épuisement de tous les niveaux que le lieu est marqué
 * 'failed'. Met à jour la ligne en base (coordonnées, pays/région,
 * `geocode_precision`) et renvoie le résultat.
 */
export async function geocodePlace(place, { year, aliases = [] } = {}) {
  const alias = resolveHistoricalAlias(aliases, place.raw_label, year);
  if (alias) {
    const patch = {
      latitude: alias.latitude,
      longitude: alias.longitude,
      country: place.country || alias.country,
      region: place.region || alias.region,
      geocoded_at: new Date().toISOString(),
      geocode_status: 'ok',
      geocode_precision: 'alias',
    };
    const { error } = await supabase.from('places').update(patch).eq('id', place.id);
    if (error) throw error;
    return { ...place, ...patch, source: 'alias' };
  }

  // Adresse française : la BAN d'abord, essayée pour chaque numéro d'une plage.
  const inFrance = !place.country || /^france$/i.test(place.country.trim());
  if (inFrance && place.street_name && place.city) {
    const numbers = streetNumberCandidates(place.street_number);
    const rest = [place.postal_code, place.city].filter(Boolean).join(' ');
    const queries = (numbers.length ? numbers : ['']).map((n) => [n, place.street_name, rest].filter(Boolean).join(' '));
    for (const query of queries) {
      try {
        const result = await geocodeViaBan(query);
        if (result) {
          const patch = {
            latitude: result.latitude,
            longitude: result.longitude,
            country: place.country || 'France',
            region: place.region || null,
            geocoded_at: new Date().toISOString(),
            geocode_status: 'ok',
            geocode_precision: 'street',
          };
          const { error } = await supabase.from('places').update(patch).eq('id', place.id);
          if (error) throw error;
          return { ...place, ...patch, source: 'ban' };
        }
      } catch (err) {
        console.error(`Géocodage BAN de "${query}" impossible :`, err);
      }
    }
  }

  const levels = buildGeocodeLevels(place);
  for (let i = 0; i < levels.length; i++) {
    try {
      const result = await geocodeViaNominatim(levels[i].query);
      if (result) {
        const patch = {
          latitude: result.latitude,
          longitude: result.longitude,
          // Ce qui a été saisi prime : le géocodeur ne fait que combler les vides.
          country: place.country || result.country,
          region: place.region || result.region,
          geocoded_at: new Date().toISOString(),
          geocode_status: 'ok',
          geocode_precision: levels[i].precision,
        };
        const { error } = await supabase.from('places').update(patch).eq('id', place.id);
        if (error) throw error;
        return { ...place, ...patch, source: 'nominatim' };
      }
    } catch (err) {
      console.error(`Géocodage de "${levels[i].query}" impossible :`, err);
    }
    // Repli vers un niveau plus général : une nouvelle requête Nominatim,
    // donc on respecte le même espacement qu'entre deux lieux différents.
    if (i < levels.length - 1) await sleep(1100);
  }

  await supabase.from('places').update({ geocode_status: 'failed' }).eq('id', place.id);
  return { ...place, geocode_status: 'failed', source: 'nominatim' };
}

/** Enregistre des coordonnées saisies à la main (panneau "Lieux à résoudre"). */
export async function setPlaceCoordinatesManually(placeId, { latitude, longitude, country, region }) {
  const { error } = await supabase
    .from('places')
    .update({ latitude, longitude, country: country || null, region: region || null, geocode_status: 'manual', geocoded_at: new Date().toISOString() })
    .eq('id', placeId);
  if (error) throw error;
}

function yearOfDate(dateStr) {
  if (!dateStr) return null;
  const y = parseInt(String(dateStr).slice(0, 4), 10);
  return Number.isFinite(y) ? y : null;
}

/**
 * Pour chaque lieu, une année "représentative" (la plus ancienne
 * trouvée) déduite de tout ce qui le référence — événements, mais
 * aussi naissance/décès d'un individu et début d'union, qui pointent
 * directement vers `places` sans passer par `events`. Sert à choisir
 * la bonne correspondance historique quand plusieurs périodes
 * existent pour un même toponyme.
 */
async function buildPlaceYearHints(treeId) {
  const [{ data: events }, { data: individuals }, { data: unions }] = await Promise.all([
    supabase.from('events').select('place_id, event_date').eq('tree_id', treeId).not('place_id', 'is', null),
    supabase.from('individuals').select('birth_place_id, birth_date, death_place_id, death_date').eq('tree_id', treeId),
    supabase.from('unions').select('place_id, start_date').eq('tree_id', treeId).not('place_id', 'is', null),
  ]);

  const years = new Map();
  const consider = (placeId, dateStr) => {
    const y = yearOfDate(dateStr);
    if (placeId == null || y == null) return;
    if (!years.has(placeId) || y < years.get(placeId)) years.set(placeId, y);
  };
  for (const e of events || []) consider(e.place_id, e.event_date);
  for (const i of individuals || []) {
    consider(i.birth_place_id, i.birth_date);
    consider(i.death_place_id, i.death_date);
  }
  for (const u of unions || []) consider(u.place_id, u.start_date);
  return years;
}

/**
 * Géocode en série tous les lieux non résolus d'un arbre (statut
 * 'pending', ou 'failed' si includeFailedRetries). Espace les appels
 * Nominatim d'un peu plus d'une seconde pour respecter sa politique
 * d'usage ; les résolutions par correspondance historique (aucun appel
 * réseau) ne sont pas ralenties.
 */
export async function geocodeAllPendingPlaces(treeId, { includeFailedRetries = false, onProgress } = {}) {
  const statuses = includeFailedRetries ? ['pending', 'failed'] : ['pending'];
  const { data: places, error } = await supabase
    .from('places')
    .select('*')
    .eq('tree_id', treeId)
    .in('geocode_status', statuses);
  if (error) throw error;
  if (!places.length) return { total: 0, resolved: 0, failed: 0 };

  const [aliases, yearHints] = await Promise.all([listHistoricalAliases(treeId), buildPlaceYearHints(treeId)]);

  let resolved = 0;
  let failed = 0;
  for (let i = 0; i < places.length; i++) {
    const place = places[i];
    const year = yearHints.get(place.id) ?? null;
    const alias = resolveHistoricalAlias(aliases, place.raw_label, year);
    const result = await geocodePlace(place, { year, aliases });
    if (result.geocode_status === 'ok') resolved++;
    else failed++;
    onProgress?.({ index: i + 1, total: places.length, place, result });
    // Pas de délai nécessaire si résolu par correspondance (pas d'appel réseau).
    if (!alias && i < places.length - 1) await new Promise((r) => setTimeout(r, 1100));
  }
  return { total: places.length, resolved, failed };
}
