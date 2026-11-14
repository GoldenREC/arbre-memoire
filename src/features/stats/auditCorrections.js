/**
 * Corrections en un clic depuis l'Audit : choisir la bonne version d'un
 * événement enregistré plusieurs fois, et supprimer une source fausse.
 *
 * Partie pure (testée) : describeEventVersions / pickBestEvent préparent
 * ce que l'écran compare. Partie écriture : keepEventVersion applique le
 * choix — les preuves des versions écartées suivent la version gardée
 * (rien n'est perdu ; une source fausse se supprime ensuite d'un clic),
 * et pour une naissance, un décès, une mise en couple ou un divorce la
 * fiche est alignée sur la version gardée, puisque c'est elle qui
 * s'affiche partout (fiche, arbre, carte).
 */
import { supabase } from '../../lib/supabaseClient.js';

const PROOF_RANK = { proven_original: 1, proven_secondary: 2, probable: 3, hypothesis: 4, disproved: 5 };

/** Sources rattachées à un événement : [{ id, title, repository, callNumber, sourceType, hasMedia }]. */
function sourcesOfEvent(eventId, { citations, sources }) {
  const sourceById = new Map(sources.map((s) => [s.id, s]));
  const seen = new Map();
  for (const c of citations) {
    if (c.eventId !== eventId || seen.has(c.sourceId)) continue;
    const source = sourceById.get(c.sourceId);
    if (source) seen.set(c.sourceId, { ...source, hasMedia: !!c.hasMedia, transcription: c.transcription || null });
  }
  return [...seen.values()];
}

/**
 * Versions d'un même événement, prêtes à comparer : date, lieu, niveau de
 * preuve, sources, et `onRecord` (la version qui correspond à ce que la
 * fiche affiche, pour une naissance ou un décès). `differs` liste les
 * champs qui varient d'une version à l'autre, pour les mettre en évidence.
 */
export function describeEventVersions(eventIds, bundle) {
  const eventById = new Map(bundle.events.map((e) => [e.id, e]));
  const individualById = new Map(bundle.individuals.map((i) => [i.id, i]));
  const versions = eventIds
    .map((id) => eventById.get(id))
    .filter(Boolean)
    .map((e) => {
      const ind = e.subjectKind === 'individual' ? individualById.get(e.subjectId) : null;
      const recordDate = ind && (e.eventType === 'birth' ? ind.birthDate : e.eventType === 'death' ? ind.deathDate : undefined);
      const recordPlace = ind && (e.eventType === 'birth' ? ind.birthPlaceId : e.eventType === 'death' ? ind.deathPlaceId : undefined);
      return {
        event: e,
        date: e.date || null,
        datePrecision: e.datePrecision || 'unknown',
        placeLabel: bundle.placesById.get(e.placeId) || null,
        proofLevel: e.proofLevel || null,
        sources: sourcesOfEvent(e.id, bundle),
        onRecord: !!ind && recordDate !== undefined && (e.date || null) === (recordDate || null) && (e.placeId || null) === (recordPlace || null),
      };
    });
  const varies = (pick) => new Set(versions.map(pick)).size > 1;
  return {
    versions,
    differs: {
      date: varies((v) => v.date || ''),
      place: varies((v) => v.placeLabel || ''),
      proof: varies((v) => v.proofLevel || ''),
    },
  };
}

/** Niveau de preuve le plus solide parmi les versions : les preuves suivant la version gardée, elle en hérite. */
export function bestProofLevel(versions) {
  return [...versions].map((v) => v.proofLevel).filter(Boolean).sort((a, b) => (PROOF_RANK[a] || 9) - (PROOF_RANK[b] || 9))[0] || null;
}

/** Choix distincts de date et de lieu proposés à l'écran, tirés de toutes les versions. */
export function versionChoices(versions) {
  const dates = new Map();
  const places = new Map();
  for (const v of versions) {
    const dateKey = `${v.date || ''}|${v.datePrecision}`;
    if (!dates.has(dateKey)) dates.set(dateKey, { key: dateKey, date: v.date, datePrecision: v.datePrecision });
    const placeKey = v.placeLabel || '';
    if (!places.has(placeKey)) places.set(placeKey, { key: placeKey, placeId: v.event.placeId || null, label: v.placeLabel });
  }
  return { dates: [...dates.values()], places: [...places.values()] };
}

/** Meilleure version à garder par défaut : celle de la fiche, sinon la mieux prouvée, sinon la plus sourcée. */
export function pickBestEvent(versions) {
  return [...versions].sort(
    (a, b) =>
      Number(b.onRecord) - Number(a.onRecord) ||
      (PROOF_RANK[a.proofLevel] || 9) - (PROOF_RANK[b.proofLevel] || 9) ||
      b.sources.length - a.sources.length
  )[0];
}

/**
 * Garde `keepEvent` et supprime les autres exemplaires. Leurs citations
 * sont rattachées à l'événement gardé (les copies exactes sont réduites à
 * une), puis la fiche est alignée si `syncRecord` est vrai.
 */
export async function keepEventVersion(keptEvent, otherEventIds, { syncRecord = true, overrides = null } = {}) {
  // `overrides` : { date, datePrecision, placeId, proofLevel } choisis à
  // l'écran parmi les autres versions (ex. garder la version qui porte
  // l'acte, mais avec le lieu d'une autre) — appliqués à l'événement gardé.
  const keepEvent = overrides ? { ...keptEvent, ...overrides } : keptEvent;
  if (overrides) {
    const { error: updErr } = await supabase
      .from('events')
      .update({
        event_date: keepEvent.date || null,
        date_precision: keepEvent.datePrecision || 'unknown',
        place_id: keepEvent.placeId || null,
        ...(keepEvent.proofLevel ? { proof_level: keepEvent.proofLevel } : {}),
      })
      .eq('id', keepEvent.id);
    if (updErr) throw updErr;
  }
  const others = otherEventIds.filter((id) => id !== keepEvent.id);
  if (others.length) {
    const { error: moveErr } = await supabase.from('citations').update({ event_id: keepEvent.id }).in('event_id', others);
    if (moveErr) throw moveErr;
    const { error: delErr } = await supabase.from('events').delete().in('id', others);
    if (delErr) throw delErr;
  }

  const { data: citations, error: citErr } = await supabase
    .from('citations')
    .select('id, source_id, transcription, created_at')
    .eq('event_id', keepEvent.id);
  if (citErr) throw citErr;
  const seen = new Set();
  const redundant = [];
  for (const c of [...(citations || [])].sort((a, b) => (a.created_at || '').localeCompare(b.created_at || ''))) {
    const key = `${c.source_id}|${(c.transcription || '').trim()}`;
    if (seen.has(key)) redundant.push(c.id);
    else seen.add(key);
  }
  if (redundant.length) {
    const { error } = await supabase.from('citations').delete().in('id', redundant);
    if (error) throw error;
  }

  if (!syncRecord) return;
  const date = keepEvent.date || null;
  const precision = keepEvent.datePrecision || 'unknown';
  const placeId = keepEvent.placeId || null;
  let table = null;
  let patch = null;
  if (keepEvent.subjectKind === 'individual' && keepEvent.eventType === 'birth') {
    table = 'individuals';
    patch = { birth_date: date, birth_date_precision: precision, birth_place_id: placeId };
  } else if (keepEvent.subjectKind === 'individual' && keepEvent.eventType === 'death') {
    table = 'individuals';
    patch = { death_date: date, death_date_precision: precision, death_place_id: placeId };
  } else if (keepEvent.subjectKind === 'union' && keepEvent.eventType === 'union_start') {
    table = 'unions';
    patch = { start_date: date, start_date_precision: precision, place_id: placeId };
  } else if (keepEvent.subjectKind === 'union' && keepEvent.eventType === 'divorce') {
    table = 'unions';
    patch = { end_date: date, end_date_precision: precision };
  }
  if (table) {
    const { error } = await supabase.from(table).update(patch).eq('id', keepEvent.subjectId);
    if (error) throw error;
  }
}

/** Supprime des événements (leurs rattachements de preuves partent avec eux ; les sources elles-mêmes restent). */
export async function deleteEvents(eventIds) {
  const { error } = await supabase.from('events').delete().in('id', eventIds);
  if (error) throw error;
}

/**
 * Résout un jalon contraire au statut en donnant raison à l'événement :
 * l'union devient "mariée" (événement mariage) ou "divorcée" (événement
 * divorce). Mêmes colonnes que le sélecteur de statut (unionMutations.js).
 */
export async function alignUnionStatusWithEvent(event) {
  const patch = event.eventType === 'divorce'
    ? { union_type: 'marriage', status: 'divorced', end_date: event.date || null, end_date_precision: event.datePrecision || 'unknown' }
    : { union_type: 'marriage', status: 'ongoing' };
  const { error } = await supabase.from('unions').update(patch).eq('id', event.subjectId);
  if (error) throw error;
}

/** Fusionne en série les doublons strictement identiques (aucun choix à faire). Retourne le nombre de constats traités. */
export async function mergeIdenticalFindings(findings, bundle, onProgress) {
  let done = 0;
  for (const f of findings) {
    const { versions } = describeEventVersions(f.eventIds, bundle);
    if (versions.length < 2) continue;
    const best = pickBestEvent(versions);
    await keepEventVersion(best.event, f.eventIds, { syncRecord: false });
    done += 1;
    onProgress?.(done);
  }
  return done;
}
