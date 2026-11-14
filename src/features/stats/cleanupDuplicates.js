/**
 * Nettoyage en un clic des doublons d'événements/unions laissés par
 * d'anciennes fusions de fiches (bug corrigé dans
 * supabase/merge_dedupe_events.sql — merge_individuals() ne
 * dédoublonnait pas les événements/unions qu'elle réaffectait).
 * Déclenché depuis Audit → bouton "Nettoyer les événements en double".
 */
import { supabase } from '../../lib/supabaseClient.js';

export async function cleanupTreeEventDuplicates(treeId) {
  // Lieux d'abord (supabase/dedupe_events_by_place_label.sql) : deux
  // événements identiques rattachés à deux fiches "lieu" jumelles ne sont
  // reconnus comme doublons qu'une fois ces lieux fusionnés. Facultatif :
  // si la fonction n'est pas installée, le reste du nettoyage continue.
  let placesMerged = null;
  const { data: placeCount, error: placeErr } = await supabase.rpc('cleanup_tree_place_duplicates', { p_tree_id: treeId });
  if (!placeErr) placesMerged = placeCount ?? 0;

  const { data, error } = await supabase.rpc('cleanup_tree_event_duplicates', { p_tree_id: treeId });
  if (error) throw error;
  const row = Array.isArray(data) ? data[0] : data;

  // Sources en double (supabase/dedupe_sources.sql). Si cette fonction
  // n'est pas encore installée en base, le reste du nettoyage reste
  // valable : on le signale sans tout faire échouer.
  let sourcesRemoved = null;
  let sourcesError = null;
  const { data: sourceCount, error: sourceErr } = await supabase.rpc('cleanup_tree_source_duplicates', { p_tree_id: treeId });
  if (sourceErr) sourcesError = sourceErr.message || String(sourceErr);
  else sourcesRemoved = sourceCount ?? 0;

  return {
    unionsMerged: row?.unions_merged ?? 0,
    eventsRemoved: row?.events_removed ?? 0,
    sourcesRemoved,
    placesMerged,
    sourcesError,
  };
}
