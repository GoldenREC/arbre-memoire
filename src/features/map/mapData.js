import { supabase } from '../../lib/supabaseClient.js';
import { isPrivacyProtected, canViewFullDetails } from '../../lib/utils/privacy.js';

export const EVENT_FILTERS = {
  all: { label: 'Tout', types: null },
  birth: { label: 'Naissances', types: ['birth'] },
  death: { label: 'Décès', types: ['death'] },
  marriage: { label: 'Mariages', types: ['marriage'] },
  other: { label: 'Autres', types: ['occupation', 'residence', 'education', 'military', 'religion', 'immigration', 'emigration', 'engagement', 'baptism', 'burial', 'divorce', 'custom'] },
};

function yearOf(dateStr) {
  if (!dateStr) return null;
  const y = parseInt(dateStr.slice(0, 4), 10);
  return Number.isFinite(y) ? y : null;
}

/**
 * Charge tous les événements géolocalisables d'un arbre (lieu résolu
 * avec des coordonnées) prêts pour la carte : type, année, personnes
 * concernées, indice de preuve. Le masquage RGPD des personnes
 * vivantes s'applique ici en amont — un pin de localisation est une
 * donnée au moins aussi sensible qu'un nom, donc un rôle sans accès
 * complet (invité) ne reçoit tout simplement pas ces événements.
 */
export async function fetchMapEvents(treeId, role, privacyThresholdYears = 100) {
  const [{ data: eventRows, error: e1 }, { data: placeRows, error: e2 }, { data: individualRows, error: e3 }, { data: unionRows, error: e4 }, { data: partnerRows, error: e5 }] =
    await Promise.all([
      supabase.from('events').select('id, subject_kind, subject_id, event_type, label, event_date, date_precision, place_id, proof_level').eq('tree_id', treeId).not('place_id', 'is', null),
      supabase.from('places').select('id, raw_label, latitude, longitude, geocode_status').eq('tree_id', treeId),
      supabase.from('individuals').select('id, first_names, last_name, sex, birth_date, death_date, is_deceased').eq('tree_id', treeId),
      supabase.from('unions').select('id').eq('tree_id', treeId),
      supabase.from('union_partners').select('union_id, individual_id, unions!inner(tree_id)').eq('unions.tree_id', treeId),
    ]);
  const firstError = e1 || e2 || e3 || e4 || e5;
  if (firstError) throw firstError;

  const placesById = new Map((placeRows || []).map((p) => [p.id, p]));
  const individualsById = new Map((individualRows || []).map((i) => [i.id, {
    id: i.id, firstNames: i.first_names, lastName: i.last_name, sex: i.sex,
    birthDate: i.birth_date, deathDate: i.death_date, isDeceased: i.is_deceased,
  }]));
  const partnersByUnion = new Map();
  for (const row of partnerRows || []) {
    if (!partnersByUnion.has(row.union_id)) partnersByUnion.set(row.union_id, []);
    partnersByUnion.get(row.union_id).push(row.individual_id);
  }

  const canSeeAll = canViewFullDetails(role);

  const results = [];
  for (const ev of eventRows || []) {
    const place = placesById.get(ev.place_id);
    if (!place || place.latitude == null || place.longitude == null) continue; // pas encore géocodé

    let people = [];
    if (ev.subject_kind === 'individual') {
      const ind = individualsById.get(ev.subject_id);
      if (!ind) continue;
      if (!canSeeAll && isPrivacyProtected(ind, privacyThresholdYears)) continue;
      people = [ind];
    } else if (ev.subject_kind === 'union') {
      const partnerIds = partnersByUnion.get(ev.subject_id) || [];
      people = partnerIds.map((id) => individualsById.get(id)).filter(Boolean);
      if (!canSeeAll && people.some((p) => isPrivacyProtected(p, privacyThresholdYears))) continue;
      if (!people.length) continue;
    } else {
      continue; // type de sujet non géré par la carte (pet/event imbriqué)
    }

    results.push({
      id: ev.id,
      subjectKind: ev.subject_kind,
      subjectId: ev.subject_id,
      eventType: ev.event_type,
      label: ev.label,
      date: ev.event_date,
      year: yearOf(ev.event_date),
      datePrecision: ev.date_precision,
      proofLevel: ev.proof_level,
      placeId: ev.place_id,
      placeLabel: place.raw_label,
      latitude: place.latitude,
      longitude: place.longitude,
      people: people.map((p) => ({ id: p.id, name: `${p.firstNames || ''} ${p.lastName || ''}`.trim() || 'Sans nom' })),
    });
  }
  return results;
}

/** Liste des lieux d'un arbre, avec leur statut de géocodage — pour le panneau "Lieux à résoudre". */
export async function fetchPlacesWithStatus(treeId) {
  const { data, error } = await supabase
    .from('places')
    .select('id, raw_label, normalized, latitude, longitude, country, region, geocode_status, geocoded_at')
    .eq('tree_id', treeId)
    .order('raw_label');
  if (error) throw error;
  return data || [];
}

/**
 * Pour un individu donné, ses événements géolocalisés (parmi ceux déjà
 * chargés par fetchMapEvents, donc déjà filtrés RGPD) triés
 * chronologiquement — sert à tracer un "chemin de migration" (une
 * polyligne reliant ses lieux de vie successifs). Fonction pure, pas
 * de requête réseau supplémentaire : on réutilise l'ensemble déjà en
 * mémoire plutôt que de re-charger un événement par personne choisie.
 */
export function buildIndividualPath(events, individualId) {
  const own = events.filter((e) => e.subjectKind === 'individual' && e.subjectId === individualId);
  const withYear = own.filter((e) => e.year != null).sort((a, b) => a.year - b.year);
  // Déduplique les lieux consécutifs identiques (ex: naissance et baptême au même endroit).
  const points = [];
  for (const e of withYear) {
    const last = points[points.length - 1];
    if (last && last.latitude === e.latitude && last.longitude === e.longitude) continue;
    points.push(e);
  }
  return points;
}
