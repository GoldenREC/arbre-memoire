/**
 * Calcule l'état des trois pastilles "N / M / D" (Naissance, Mariage,
 * Décès) affichées sur chaque fiche individu : un acte est considéré
 * "joint et validé" dès qu'une citation rattachée à l'événement cité
 * porte au moins un média scanné (voir `hasMedia` dans
 * useIndividualDetail.js). Fonction pure, testable indépendamment de
 * Supabase — toute la donnée (événements, citations, unions) lui est
 * passée déjà chargée.
 */

function hasValidatedAct(eventId, citations) {
  if (!eventId) return false;
  return citations.some((c) => c.eventId === eventId && c.hasMedia);
}

export function computeNmdStatus({ individual, unions = [], events = [], citations = [] }) {
  const birthEvent = events.find((e) => e.origin === 'individual' && e.eventType === 'birth') || null;
  const deathEvent = events.find((e) => e.origin === 'individual' && e.eventType === 'death') || null;
  const marriageEventByUnion = new Map(
    events.filter((e) => e.origin === 'union' && e.eventType === 'marriage').map((e) => [e.unionId, e])
  );

  const marriageOptions = unions.map((u) => {
    const eventRow = marriageEventByUnion.get(u.id) || null;
    return {
      unionId: u.id,
      eventId: eventRow?.id || null,
      proofLevel: eventRow?.proofLevel || null,
      partnerName: u.partner ? `${u.partner.firstNames || ''} ${u.partner.lastName || ''}`.trim() : null,
      startDate: u.startDate,
      startDatePrecision: u.startDatePrecision,
      placeId: u.placeId,
      hasAct: hasValidatedAct(eventRow?.id, citations),
    };
  });

  return {
    birth: {
      eventId: birthEvent?.id || null,
      proofLevel: birthEvent?.proofLevel || null,
      hasAct: hasValidatedAct(birthEvent?.id, citations),
    },
    death: {
      eventId: deathEvent?.id || null,
      proofLevel: deathEvent?.proofLevel || null,
      hasAct: hasValidatedAct(deathEvent?.id, citations),
    },
    marriage: {
      hasAct: marriageOptions.some((o) => o.hasAct),
      options: marriageOptions,
    },
  };
}
