/**
 * Nettoyage en un clic des doublons d'événements/unions laissés par
 * d'anciennes fusions de fiches (bug corrigé dans
 * supabase/merge_dedupe_events.sql — merge_individuals() ne
 * dédoublonnait pas les événements/unions qu'elle réaffectait).
 * Déclenché depuis Audit → bouton "Nettoyer les événements en double".
 */
import { supabase } from '../../lib/supabaseClient.js';

export async function cleanupTreeEventDuplicates(treeId) {
  const { data, error } = await supabase.rpc('cleanup_tree_event_duplicates', { p_tree_id: treeId });
  if (error) throw error;
  const row = Array.isArray(data) ? data[0] : data;
  return {
    unionsMerged: row?.unions_merged ?? 0,
    eventsRemoved: row?.events_removed ?? 0,
  };
}
