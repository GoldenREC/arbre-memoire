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

/** Un seul appel Nominatim — ne pas boucler sans délai (voir geocodeAllPendingPlaces). */
async function geocodeViaNominatim(query) {
  const url = new URL(NOMINATIM_URL);
  url.searchParams.set('format', 'json');
  url.searchParams.set('limit', '1');
  url.searchParams.set('q', query);
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
 * historique si elle couvre l'année donnée, sinon appel Nominatim.
 * Met à jour la ligne en base et renvoie le résultat.
 */
export async function geocodePlace(place, { year, aliases = [] } = {}) {
  const alias = resolveHistoricalAlias(aliases, place.raw_label, year);
  if (alias) {
    const patch = {
      latitude: alias.latitude,
      longitude: alias.longitude,
      country: alias.country,
      region: alias.region,
      geocoded_at: new Date().toISOString(),
      geocode_status: 'ok',
    };
    const { error } = await supabase.from('places').update(patch).eq('id', place.id);
    if (error) throw error;
    return { ...place, ...patch, source: 'alias' };
  }

  try {
    const result = await geocodeViaNominatim(place.raw_label);
    if (!result) {
      await supabase.from('places').update({ geocode_status: 'failed' }).eq('id', place.id);
      return { ...place, geocode_status: 'failed', source: 'nominatim' };
    }
    const patch = {
      latitude: result.latitude,
      longitude: result.longitude,
      country: result.country,
      region: result.region,
      geocoded_at: new Date().toISOString(),
      geocode_status: 'ok',
    };
    const { error } = await supabase.from('places').update(patch).eq('id', place.id);
    if (error) throw error;
    return { ...place, ...patch, source: 'nominatim' };
  } catch (err) {
    console.error(`Géocodage de "${place.raw_label}" impossible :`, err);
    await supabase.from('places').update({ geocode_status: 'failed' }).eq('id', place.id);
    return { ...place, geocode_status: 'failed', error: err.message };
  }
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
