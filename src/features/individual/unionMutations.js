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
import { attachDateProof } from './actsMutations.js';

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
async function ensureUnionMilestoneEvent(treeId, unionId, eventType, { date, datePrecision, place } = {}, { keepIfEmpty = false } = {}) {
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
    // Jalon sans date ni lieu mais qui porte la preuve de l'union (ex. un
    // couple dont on ne connaît pas la date) : on garde l'événement, sinon
    // sa preuve disparaîtrait avec lui à chaque enregistrement.
    if (keepIfEmpty) {
      if (existing) {
        const { error } = await supabase.from('events').update({ event_date: null, date_precision: 'unknown', place_id: null }).eq('id', existing.id);
        if (error) throw error;
      }
      return;
    }
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

export const MILESTONE_LABELS = { union_start: 'Mise en couple', marriage: 'Mariage', divorce: 'Divorce' };

const DEFINING_MILESTONES = {
  couple: ['union_start'],
  married: ['marriage'],
  divorced: ['marriage', 'divorce'],
};

function milestoneHasContent(m) {
  return !!m?.date || !isPlaceEmpty(m?.place);
}

/**
 * Jalons qui doivent porter une preuve pour le statut choisi : celui (ou
 * ceux) qui définit le statut — la mise en couple pour "en couple", le
 * mariage pour "mariée", mariage + divorce pour "divorcée" — même sans
 * date connue, plus tout autre jalon affiché pour lequel une date ou un
 * lieu est renseigné. Une union ne s'enregistre donc jamais sans preuve.
 */
export function milestonesRequiringProof(relationshipStatus, { start, marriage, divorce } = {}) {
  const defining = DEFINING_MILESTONES[relationshipStatus] || DEFINING_MILESTONES.couple;
  const visible = { union_start: start, ...(relationshipStatus !== 'couple' ? { marriage } : {}), ...(relationshipStatus === 'divorced' ? { divorce } : {}) };
  return Object.keys(visible).filter((key) => defining.includes(key) || milestoneHasContent(visible[key]));
}

/** "Prénom Nom & Prénom Nom" des conjoints d'une union, pour nommer ses sources ('' si introuvables). */
async function fetchUnionPartnerNames(unionId) {
  const { data: partners, error } = await supabase.from('union_partners').select('individual_id').eq('union_id', unionId);
  if (error || !partners?.length) return '';
  const names = [];
  for (const p of partners) {
    const { data: ind } = await supabase.from('individuals').select('first_names, last_name').eq('id', p.individual_id).maybeSingle();
    const name = `${ind?.first_names || ''} ${ind?.last_name || ''}`.trim();
    if (name) names.push(name);
  }
  return names.join(' & ');
}

/** Quels jalons de cette union ont déjà au moins une preuve rattachée : { union_start, marriage, divorce } (booléens). */
export async function fetchUnionMilestoneProofs(unionId) {
  const result = { union_start: false, marriage: false, divorce: false };
  if (!unionId) return result;
  const { data: events, error } = await supabase
    .from('events')
    .select('id, event_type')
    .eq('subject_kind', 'union')
    .eq('subject_id', unionId);
  if (error) throw error;
  const ids = (events || []).map((e) => e.id);
  if (!ids.length) return result;
  const { data: citations, error: citErr } = await supabase.from('citations').select('event_id').in('event_id', ids);
  if (citErr) throw citErr;
  const cited = new Set((citations || []).map((c) => c.event_id));
  for (const e of events) {
    if (e.event_type in result && cited.has(e.id)) result[e.event_type] = true;
  }
  return result;
}

/**
 * Enregistre le statut d'une union et ses jalons. `start`/`marriage`/
 * `divorce` : { date, datePrecision, place } (place = objet structuré,
 * voir StructuredPlaceInput). Les jalons non pertinents pour le statut
 * choisi (ex: "divorce" pour une union "en couple") sont nettoyés s'ils
 * existaient déjà (cas d'une correction : une union importée à tort
 * comme "mariage" perd son événement de mariage en repassant "en couple").
 * `proofs` (optionnel) : { union_start?, marriage?, divorce? }, chacun au
 * format DateProofInput — rattaché à l'événement du jalon par le même
 * chemin que les preuves de naissance/décès (attachDateProof).
 */
export async function saveUnionMilestones(treeId, unionId, { relationshipStatus, start, marriage, divorce, proofs = {} }) {
  const mapping = STATUS_TO_UNION_COLUMNS[relationshipStatus] || STATUS_TO_UNION_COLUMNS.couple;
  const startPlaceId = isPlaceEmpty(start?.place) ? null : await findOrCreateStructuredPlace(treeId, start.place);
  const defining = DEFINING_MILESTONES[relationshipStatus] || DEFINING_MILESTONES.couple;

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

  const milestones = {
    union_start: start,
    marriage: relationshipStatus === 'couple' ? null : marriage,
    divorce: relationshipStatus === 'divorced' ? divorce : null,
  };
  for (const [eventType, milestone] of Object.entries(milestones)) {
    await ensureUnionMilestoneEvent(treeId, unionId, eventType, milestone || {}, { keepIfEmpty: !!milestone && defining.includes(eventType) });
  }

  const couple = Object.values(proofs).some(Boolean) ? await fetchUnionPartnerNames(unionId) : '';
  for (const [eventType, proof] of Object.entries(proofs)) {
    const milestone = milestones[eventType];
    if (!proof || !milestone) continue;
    const kind = proof.type === 'marginal' ? 'Mention marginale' : proof.type === 'family' ? 'Information familiale' : 'Acte';
    await attachDateProof(treeId, {
      subjectKind: 'union',
      subjectId: unionId,
      eventType,
      snapshot: { date: milestone.date || null, datePrecision: milestone.datePrecision || 'unknown', placeId: eventType === 'union_start' ? startPlaceId : null },
      title: `${kind} — ${MILESTONE_LABELS[eventType].toLowerCase()}${couple ? ` — ${couple}` : ''}`,
      proof,
    });
  }
}
