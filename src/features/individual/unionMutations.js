/**
 * Écritures propres aux jalons d'une union (mise en couple / mariage /
 * divorce), distinctes de createUnion/removeUnion (individualMutations.js,
 * qui ne gèrent que la création/suppression brute du lien conjoint-à-
 * conjoint). Une union peut porter jusqu'à trois événements datés —
 * subject_kind='union' — chacun avec sa propre date/lieu, au lieu d'une
 * seule date de mariage obligatoire pour toute union : en couple (un
 * seul jalon, "mise en couple"), mariée (+ "mariage"), divorcée (+
 * "divorce"). "Mise en couple" est systématiquement répercutée sur
 * unions.start_date/place_id (déjà lus ailleurs dans l'app — CivilHeader,
 * NmdBadges, auditEngine...), les deux autres jalons n'existent que sous
 * forme d'événements.
 */
import { supabase } from '../../lib/supabaseClient.js';
import { findOrCreateStructuredPlace } from './individualMutations.js';
import { isPlaceEmpty } from '../../lib/utils/placeLabel.js';

export const RELATIONSHIP_STATUS_LABELS = {
  couple: 'En couple',
  married: 'Mariée',
  divorced: 'Divorcée',
};

const STATUS_TO_UNION_COLUMNS = {
  couple: { unionType: 'cohabitation', status: 'ongoing' },
  married: { unionType: 'marriage', status: 'ongoing' },
  divorced: { unionType: 'marriage', status: 'divorced' },
};

/** Déduit le choix du sélecteur (en couple/mariée/divorcée) à partir d'une union existante. */
export function relationshipStatusFromUnion(union) {
  if (!union) return 'couple';
  if (union.status === 'divorced') return 'divorced';
  if (union.unionType === 'marriage') return 'married';
  return 'couple';
}

/** Crée, met à jour, ou supprime (si date et lieu vides) l'événement d'un jalon d'union. */
async function ensureUnionMilestoneEvent(treeId, unionId, eventType, { date, datePrecision, place } = {}) {
  const hasContent = !!date || !isPlaceEmpty(place);

  const { data: existing, error: findErr } = await supabase
    .from('events')
    .select('id')
    .eq('subject_kind', 'union')
    .eq('subject_id', unionId)
    .eq('event_type', eventType)
    .limit(1)
    .maybeSingle();
  if (findErr) throw findErr;

  if (!hasContent) {
    if (existing) {
      const { error } = await supabase.from('events').delete().eq('id', existing.id);
      if (error) throw error;
    }
    return;
  }

  const placeId = isPlaceEmpty(place) ? null : await findOrCreateStructuredPlace(treeId, place);
  const row = {
    tree_id: treeId,
    subject_kind: 'union',
    subject_id: unionId,
    event_type: eventType,
    event_date: date || null,
    date_precision: datePrecision || 'unknown',
    place_id: placeId,
  };

  if (existing) {
    const { error } = await supabase.from('events').update(row).eq('id', existing.id);
    if (error) throw error;
  } else {
    const { error } = await supabase.from('events').insert(row);
    if (error) throw error;
  }
}

/**
 * Enregistre le statut d'une union et ses jalons. `start`/`marriage`/
 * `divorce` : { date, datePrecision, place } (place = objet structuré,
 * voir StructuredPlaceInput). Les jalons non pertinents pour le statut
 * choisi (ex: "divorce" pour une union "en couple") sont nettoyés s'ils
 * existaient déjà (cas d'une correction : une union importée à tort
 * comme "mariage" perd son événement de mariage en repassant "en couple").
 */
export async function saveUnionMilestones(treeId, unionId, { relationshipStatus, start, marriage, divorce }) {
  const mapping = STATUS_TO_UNION_COLUMNS[relationshipStatus] || STATUS_TO_UNION_COLUMNS.couple;
  const startPlaceId = isPlaceEmpty(start?.place) ? null : await findOrCreateStructuredPlace(treeId, start.place);

  const { error } = await supabase
    .from('unions')
    .update({
      union_type: mapping.unionType,
      status: mapping.status,
      start_date: start?.date || null,
      start_date_precision: start?.datePrecision || 'unknown',
      place_id: startPlaceId,
      end_date: relationshipStatus === 'divorced' ? divorce?.date || null : null,
      end_date_precision: relationshipStatus === 'divorced' ? divorce?.datePrecision || 'unknown' : 'unknown',
    })
    .eq('id', unionId);
  if (error) throw error;

  await ensureUnionMilestoneEvent(treeId, unionId, 'union_start', start);
  await ensureUnionMilestoneEvent(treeId, unionId, 'marriage', relationshipStatus === 'couple' ? {} : marriage);
  await ensureUnionMilestoneEvent(treeId, unionId, 'divorce', relationshipStatus === 'divorced' ? divorce : {});
}
