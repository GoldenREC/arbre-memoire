import { supabase } from '../supabaseClient.js';

/**
 * Branches suivies par le membre connecté (voir supabase/settings.sql :
 * table followed_individuals + notify_new_photo()/individual_ancestors()).
 * Suivre une personne déclenche une notification "nouveau portrait" pour
 * elle-même et tous ses descendants.
 */
export async function listFollowedIndividuals(treeId) {
  const { data: followRows, error } = await supabase
    .from('followed_individuals')
    .select('individual_id, created_at')
    .eq('tree_id', treeId);
  if (error) throw error;

  const ids = (followRows || []).map((r) => r.individual_id);
  let namesById = new Map();
  if (ids.length) {
    const { data: indRows, error: indErr } = await supabase.from('individuals').select('id, first_names, last_name').in('id', ids);
    if (indErr) throw indErr;
    namesById = new Map((indRows || []).map((i) => [i.id, `${i.first_names || ''} ${i.last_name || ''}`.trim() || 'Sans nom']));
  }

  return (followRows || []).map((r) => ({
    individualId: r.individual_id,
    createdAt: r.created_at,
    name: namesById.get(r.individual_id) || 'Sans nom',
  }));
}

export async function followIndividual(treeId, userId, individualId) {
  const { error } = await supabase.from('followed_individuals').insert({ tree_id: treeId, user_id: userId, individual_id: individualId });
  if (error) throw error;
}

export async function unfollowIndividual(treeId, userId, individualId) {
  const { error } = await supabase.from('followed_individuals').delete().eq('tree_id', treeId).eq('user_id', userId).eq('individual_id', individualId);
  if (error) throw error;
}

export async function isFollowing(treeId, userId, individualId) {
  const { data, error } = await supabase
    .from('followed_individuals')
    .select('individual_id')
    .eq('tree_id', treeId).eq('user_id', userId).eq('individual_id', individualId)
    .maybeSingle();
  if (error) throw error;
  return !!data;
}
