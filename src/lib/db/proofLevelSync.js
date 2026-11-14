/**
 * Indice de preuve tenu à jour d'après les preuves réellement rattachées.
 *
 * L'indice d'un événement (`events.proof_level`) n'était fixé qu'au
 * moment où une preuve était choisie dans le formulaire de fiche. Une
 * source ajoutée ou complétée autrement (gestionnaire de sources, scan
 * ajouté après coup, pastilles N/M/D) laissait l'événement sur
 * "Hypothèse / à vérifier" malgré l'acte joint. Ces fonctions recalculent
 * l'indice à partir des sources citées, avec la même échelle que
 * attachDateProof (actsMutations.js) :
 *   acte avec scan            -> prouvé par acte original
 *   acte avec seul permalien,
 *   ou mention marginale      -> source secondaire
 *   information familiale     -> probable
 * L'indice n'est que relevé, jamais abaissé : un choix fait à la main
 * (y compris "Réfuté") n'est pas écrasé.
 */
import { supabase } from '../supabaseClient.js';

const RANK = { proven_original: 1, proven_secondary: 2, probable: 3, hypothesis: 4 };

/** Indice que justifie UNE source : { sourceType, title, url, hasMedia }. null si elle ne prouve rien de classable. */
export function proofLevelOfSource(source) {
  if (source.sourceType === 'family_data') return 'probable';
  const isAct = source.sourceType === 'civil_record' || source.sourceType === 'archive_permalink';
  if (!isAct) return null;
  if (/^\s*mention marginale/i.test(source.title || '')) return source.hasMedia || source.url ? 'proven_secondary' : null;
  if (source.hasMedia) return 'proven_original';
  if (source.url) return 'proven_secondary';
  return null;
}

/** Meilleur indice justifié par un ensemble de sources, ou null. */
export function proofLevelFromSources(sources) {
  return sources.map(proofLevelOfSource).filter(Boolean).sort((a, b) => RANK[a] - RANK[b])[0] || null;
}

/** Nouvel indice à écrire, ou null s'il ne faut rien changer (jamais d'abaissement, "Réfuté" intouchable). */
export function raisedProofLevel(current, candidate) {
  if (!candidate || current === 'disproved') return null;
  return (RANK[candidate] || 9) < (RANK[current] || 9) ? candidate : null;
}

/** Calcule les relèvements à faire : [{ eventId, proofLevel }]. Fonction pure. */
export function planProofLevelUpdates({ events, citations, sources, mediaSourceIds }) {
  const sourceById = new Map(sources.map((s) => [s.id, s]));
  const sourcesByEvent = new Map();
  for (const c of citations) {
    const s = sourceById.get(c.source_id);
    if (!c.event_id || !s) continue;
    if (!sourcesByEvent.has(c.event_id)) sourcesByEvent.set(c.event_id, []);
    sourcesByEvent.get(c.event_id).push({ sourceType: s.source_type, title: s.title, url: s.url, hasMedia: mediaSourceIds.has(s.id) });
  }
  const updates = [];
  for (const e of events) {
    const next = raisedProofLevel(e.proof_level, proofLevelFromSources(sourcesByEvent.get(e.id) || []));
    if (next) updates.push({ eventId: e.id, proofLevel: next });
  }
  return updates;
}

async function applyUpdates(updates) {
  for (const u of updates) {
    const { error } = await supabase.from('events').update({ proof_level: u.proofLevel }).eq('id', u.eventId);
    if (error) throw error;
  }
  return updates.length;
}

/** Relève l'indice des événements donnés d'après leurs sources. Retourne le nombre d'événements relevés. */
export async function refreshProofLevelsForEvents(eventIds) {
  const ids = [...new Set((eventIds || []).filter(Boolean))];
  if (!ids.length) return 0;
  const [{ data: events, error: evErr }, { data: citations, error: citErr }] = await Promise.all([
    supabase.from('events').select('id, proof_level').in('id', ids),
    supabase.from('citations').select('event_id, source_id').in('event_id', ids),
  ]);
  if (evErr) throw evErr;
  if (citErr) throw citErr;
  const sourceIds = [...new Set((citations || []).map((c) => c.source_id))];
  if (!sourceIds.length) return 0;
  const [{ data: sources, error: sErr }, { data: media, error: mErr }] = await Promise.all([
    supabase.from('sources').select('id, title, url, source_type').in('id', sourceIds),
    supabase.from('media').select('source_id').in('source_id', sourceIds),
  ]);
  if (sErr) throw sErr;
  if (mErr) throw mErr;
  return applyUpdates(planProofLevelUpdates({
    events: events || [], citations: citations || [], sources: sources || [],
    mediaSourceIds: new Set((media || []).map((m) => m.source_id)),
  }));
}

/** Relève l'indice de tous les événements qui citent cette source (après ajout d'un scan, changement de type...). */
export async function refreshProofLevelsForSource(sourceId) {
  if (!sourceId) return 0;
  const { data: citations, error } = await supabase.from('citations').select('event_id').eq('source_id', sourceId);
  if (error) throw error;
  return refreshProofLevelsForEvents((citations || []).map((c) => c.event_id));
}

/** Relève l'indice de tous les événements de l'arbre (rattrapage des données existantes). */
export async function refreshAllProofLevels(treeId) {
  const [events, citations, sources, media] = await Promise.all([
    supabase.from('events').select('id, proof_level').eq('tree_id', treeId),
    supabase.from('citations').select('event_id, source_id').eq('tree_id', treeId),
    supabase.from('sources').select('id, title, url, source_type').eq('tree_id', treeId),
    supabase.from('media').select('source_id').eq('tree_id', treeId),
  ]);
  for (const r of [events, citations, sources, media]) if (r.error) throw r.error;
  return applyUpdates(planProofLevelUpdates({
    events: events.data || [], citations: citations.data || [], sources: sources.data || [],
    mediaSourceIds: new Set((media.data || []).filter((m) => m.source_id).map((m) => m.source_id)),
  }));
}
