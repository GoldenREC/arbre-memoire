import { supabase } from '../supabaseClient.js';
import { regionOfFrenchDepartment } from './frenchDepartments.js';

/**
 * Complète commune / département / région / pays des lieux déjà
 * géocodés, à partir de leurs coordonnées (géocodage inverse Nominatim).
 * Règle d'or : on ne remplit que les cases vides, jamais on n'écrase ce
 * qui a été saisi, et on ne descend pas plus bas que la précision du
 * lieu (un lieu connu seulement au département ne reçoit pas de commune).
 */
const REVERSE_URL = 'https://nominatim.openstreetmap.org/reverse';
const LEVELS = ['country', 'region', 'department', 'city'];

const norm = (s) => (s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-zA-Z0-9]+/g, ' ').trim().toLowerCase();

/** Traduit l'adresse Nominatim en nos quatre niveaux. */
export function hierarchyFromAddress(address = {}) {
  const city = address.city || address.town || address.village || address.municipality || address.hamlet || '';
  let department = address.county || address.state_district || '';
  // Paris n'a pas de "county" chez Nominatim : la ville est son département.
  if (!department && address.country_code === 'fr' && regionOfFrenchDepartment(city)) department = city;
  return { city, department, region: address.state || address.region || '', country: address.country || '' };
}

/** Niveau le plus fin qu'on a le droit de remplir pour ce lieu. */
function deepestLevel(place, found) {
  const precision = place.geocode_precision;
  if (precision === 'country' || precision === 'region' || precision === 'department') return precision;
  if (precision && precision !== 'alias') return 'city';
  // Précision inconnue (ancien libellé libre) : on ne retient un niveau
  // que si son nom figure dans le libellé d'origine.
  const label = ` ${norm(place.raw_label)} `;
  for (const level of [...LEVELS].reverse()) {
    if (found[level] && label.includes(` ${norm(found[level])} `)) return level;
  }
  return 'country';
}

/** Champs à écrire pour un lieu (cases vides uniquement) — pur, testé. */
export function backfillPatch(place, address) {
  const found = hierarchyFromAddress(address);
  const deepest = LEVELS.indexOf(deepestLevel(place, found));
  const patch = {};
  LEVELS.forEach((level, i) => {
    if (i <= deepest && found[level] && !(place[level] || '').trim()) patch[level] = found[level];
  });
  return patch;
}

export function placesNeedingBackfill(places) {
  return places.filter((p) => p.latitude != null && p.longitude != null && (!p.country || !p.region || !p.department || !p.city));
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** Une requête par seconde (politique Nominatim). Renvoie le nombre de lieux complétés. */
export async function backfillPlaceHierarchy(places, onProgress) {
  const todo = placesNeedingBackfill(places);
  let updated = 0;
  for (let i = 0; i < todo.length; i++) {
    const place = todo[i];
    onProgress?.(i + 1, todo.length);
    try {
      const url = new URL(REVERSE_URL);
      url.searchParams.set('format', 'jsonv2');
      url.searchParams.set('lat', place.latitude);
      url.searchParams.set('lon', place.longitude);
      url.searchParams.set('zoom', '10');
      url.searchParams.set('addressdetails', '1');
      url.searchParams.set('accept-language', 'fr');
      const res = await fetch(url.toString(), { headers: { Accept: 'application/json' } });
      if (res.ok) {
        const patch = backfillPatch(place, (await res.json()).address);
        if (Object.keys(patch).length) {
          const { error } = await supabase.from('places').update(patch).eq('id', place.id);
          if (error) throw error;
          updated++;
        }
      }
    } catch (err) {
      console.error(`Complément du lieu "${place.raw_label}" impossible :`, err);
    }
    if (i < todo.length - 1) await sleep(1100);
  }
  return updated;
}
