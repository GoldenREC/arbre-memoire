/**
 * Actions déclenchées depuis le panneau "Suggestions" (Audit → coquilles
 * probables de noms de famille et de lieux, voir suggestionsEngine.js) :
 * - renameIndividualLastName : corrige directement le nom de famille
 *   d'une fiche ("Modifier cette fiche" sur une suggestion de nom).
 * - mergePlaces : fusionne deux lieux via le RPC merge_places
 *   (supabase/suggestions.sql) — réaffecte toutes les références puis
 *   supprime le lieu en trop.
 * - dismissSuggestion : mémorise une suggestion ignorée pour qu'elle ne
 *   réapparaisse plus (table suggestion_dismissals).
 */
import { supabase } from '../../lib/supabaseClient.js';

export async function renameIndividualLastName(individualId, newLastName) {
  const { error } = await supabase.from('individuals').update({ last_name: newLastName }).eq('id', individualId);
  if (error) throw error;
}

export async function mergePlaces({ treeId, keepPlaceId, removePlaceId }) {
  const { error } = await supabase.rpc('merge_places', {
    p_tree_id: treeId,
    p_keep_id: keepPlaceId,
    p_remove_id: removePlaceId,
  });
  if (error) throw error;
}

export async function dismissSuggestion({ treeId, suggestionKey }) {
  const { error } = await supabase
    .from('suggestion_dismissals')
    .upsert({ tree_id: treeId, suggestion_key: suggestionKey }, { onConflict: 'tree_id,suggestion_key' });
  if (error) throw error;
}
