import { supabase } from '../../lib/supabaseClient.js';
import { findOrCreateStructuredPlace } from '../individual/individualMutations.js';
import { geocodePlace, listHistoricalAliases } from '../../lib/geo/geocoder.js';
import { isPlaceEmpty } from '../../lib/utils/placeLabel.js';

/**
 * Correction rapide de la date et du lieu d'un événement depuis la
 * carte. L'événement est modifié, puis la fiche (personne ou union) est
 * alignée : la naissance et le décès vivent aussi sur la fiche de la
 * personne, la mise en couple et le divorce sur l'union — mêmes règles
 * que partout ailleurs dans l'application.
 */

/** Ce qu'il faut écrire sur la fiche pour refléter l'événement — pur, testé. Null si l'événement ne vit que dans la chronologie. */
export function recordPatchForEvent({ subjectKind, eventType }, { date, datePrecision, placeId }) {
  const d = date || null;
  const precision = datePrecision || 'unknown';
  if (subjectKind === 'individual' && eventType === 'birth') {
    return { table: 'individuals', patch: { birth_date: d, birth_date_precision: precision, birth_place_id: placeId || null } };
  }
  if (subjectKind === 'individual' && eventType === 'death') {
    return { table: 'individuals', patch: { death_date: d, death_date_precision: precision, death_place_id: placeId || null } };
  }
  if (subjectKind === 'union' && eventType === 'union_start') {
    return { table: 'unions', patch: { start_date: d, start_date_precision: precision, place_id: placeId || null } };
  }
  if (subjectKind === 'union' && eventType === 'divorce') {
    return { table: 'unions', patch: { end_date: d, end_date_precision: precision } };
  }
  return null;
}

/** Les champs du lieu ont-ils été modifiés à l'écran ? Sinon on garde le lieu actuel tel quel. */
export function placeWasEdited(before, after) {
  const keys = new Set([...Object.keys(before || {}), ...Object.keys(after || {})]);
  for (const k of keys) if (((before || {})[k] || '').trim() !== ((after || {})[k] || '').trim()) return true;
  return false;
}

/**
 * `event` : un événement de la carte ({ id, subjectKind, subjectId,
 * eventType, placeId }). `initialPlace` : le lieu tel qu'il a été chargé
 * dans le formulaire. Renvoie { placeChanged, geocoded }.
 */
export async function saveEventDateAndPlace(treeId, event, { date, datePrecision, place, initialPlace }) {
  let placeId = event.placeId || null;
  const placeChanged = placeWasEdited(initialPlace, place);
  if (placeChanged) placeId = isPlaceEmpty(place) ? null : await findOrCreateStructuredPlace(treeId, place);

  const { error } = await supabase
    .from('events')
    .update({ event_date: date || null, date_precision: datePrecision || 'unknown', place_id: placeId })
    .eq('id', event.id);
  if (error) throw error;

  const record = recordPatchForEvent(event, { date, datePrecision, placeId });
  if (record) {
    const { error: recErr } = await supabase.from(record.table).update(record.patch).eq('id', event.subjectId);
    if (recErr) throw recErr;
  }

  // Un lieu nouveau n'a pas encore de coordonnées : on le place tout de
  // suite sur la carte, sinon l'événement en disparaîtrait.
  let geocoded = true;
  if (placeChanged && placeId) {
    const { data: row, error: placeErr } = await supabase.from('places').select('*').eq('id', placeId).maybeSingle();
    if (placeErr) throw placeErr;
    if (row && row.latitude == null) {
      const aliases = await listHistoricalAliases(treeId);
      const year = date ? Number(String(date).slice(0, 4)) || undefined : undefined;
      const result = await geocodePlace(row, { year, aliases });
      geocoded = result.geocode_status !== 'failed';
    }
  }
  return { placeChanged, geocoded, placeId };
}
