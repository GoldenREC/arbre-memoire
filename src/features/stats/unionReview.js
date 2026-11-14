/**
 * Revue des unions en masse : une ligne par union, avec ce qu'il faut
 * pour décider d'un coup d'œil si son statut est juste (les deux
 * conjoints, la date et le lieu connus, et surtout si un acte ou une
 * information prouve réellement le mariage).
 *
 * Sert à corriger les unions héritées de l'ancien import, qui marquait
 * "mariage" toute union datée : une union "mariée"/"divorcée" dont
 * l'événement de mariage n'a aucune preuve rattachée est signalée
 * `suspect`. Fonction pure (testable sans Supabase), alimentée par le
 * bundle de statsData.loadStatsBundle ; les corrections passent par
 * saveUnionMilestones (unionMutations.js), le même chemin que le
 * sélecteur en couple / mariée / divorcée de la fiche individu.
 */
import { relationshipStatusFromUnion } from '../individual/unionMutations.js';

function fullName(ind) {
  if (!ind) return 'Personne inconnue';
  return `${ind.firstNames || ''} ${ind.lastName || ''}`.trim() || 'Sans nom';
}

export function buildUnionReviewRows({ unions, partnersByUnion, individuals, events, citations, placesById }) {
  const individualsById = new Map(individuals.map((i) => [i.id, i]));
  const eventsByUnion = new Map();
  for (const e of events) {
    if (e.subjectKind !== 'union') continue;
    if (!eventsByUnion.has(e.subjectId)) eventsByUnion.set(e.subjectId, []);
    eventsByUnion.get(e.subjectId).push(e);
  }
  const citedEventIds = new Set(citations.filter((c) => c.eventId).map((c) => c.eventId));

  const rows = unions.map((u) => {
    const unionEvents = eventsByUnion.get(u.id) || [];
    const marriageEvent = unionEvents.find((e) => e.eventType === 'marriage') || null;
    const status = relationshipStatusFromUnion(u);
    const hasMarriageProof = !!marriageEvent && citedEventIds.has(marriageEvent.id);
    const partnerIds = partnersByUnion.get(u.id) || [];
    const shown = marriageEvent && status !== 'couple' ? marriageEvent : null;
    return {
      union: u,
      unionEvents,
      status,
      partnerIds,
      partnerNames: partnerIds.map((id) => fullName(individualsById.get(id))),
      date: shown?.date || u.startDate || null,
      datePrecision: shown?.datePrecision || u.startDatePrecision || 'unknown',
      placeLabel: placesById.get(shown?.placeId || u.placeId) || null,
      hasMarriageProof,
      suspect: status !== 'couple' && !hasMarriageProof,
    };
  });

  // Les unions à vérifier d'abord, puis par nom du premier conjoint.
  return rows.sort((a, b) => Number(b.suspect) - Number(a.suspect) || (a.partnerNames[0] || '').localeCompare(b.partnerNames[0] || '', 'fr'));
}

export function summarizeUnionReview(rows) {
  const summary = { total: rows.length, couple: 0, married: 0, divorced: 0, suspect: 0 };
  for (const r of rows) {
    summary[r.status] += 1;
    if (r.suspect) summary.suspect += 1;
  }
  return summary;
}
