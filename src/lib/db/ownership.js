import { supabase } from '../supabaseClient.js';
import { ownershipConfirmationPhrase } from '../utils/ownershipRules.js';

/**
 * Propriété, rétrogradation volontaire, cadenas et suppression de fiche.
 * Toutes les règles réelles sont appliquées par la base (voir
 * supabase/multi_tree.sql) : ce module ne fait qu'appeler les fonctions
 * et afficher leurs messages d'erreur.
 */

export { ownershipConfirmationPhrase, SELF_DOWNGRADE_PHRASE } from '../utils/ownershipRules.js';

/** Demandes de transfert en attente pour un arbre (visibles par les deux parties). */
export async function listPendingTransfers(treeId) {
  const { data, error } = await supabase
    .from('ownership_transfers')
    .select('id, tree_id, from_user, to_user, status, created_at, expires_at')
    .eq('tree_id', treeId)
    .eq('status', 'pending');
  if (error) throw error;
  return data || [];
}

export async function requestOwnershipTransfer(treeId, targetEmail, confirmation) {
  const { data, error } = await supabase.rpc('request_ownership_transfer', {
    p_tree_id: treeId,
    p_target_email: targetEmail,
    p_confirmation: confirmation,
  });
  if (error) throw error;
  return data;
}

/** Accepte (true) ou refuse (false) une demande reçue. */
export async function respondOwnershipTransfer(transferId, accept) {
  const { data, error } = await supabase.rpc('respond_ownership_transfer', {
    p_transfer_id: transferId,
    p_accept: accept,
  });
  if (error) throw error;
  return data;
}

export async function cancelOwnershipTransfer(transferId) {
  const { error } = await supabase.rpc('cancel_ownership_transfer', { p_transfer_id: transferId });
  if (error) throw error;
}

export async function selfDowngradeAdmin(treeId, confirmation) {
  const { error } = await supabase.rpc('self_downgrade_admin', { p_tree_id: treeId, p_confirmation: confirmation });
  if (error) throw error;
}

/**
 * Envoie le mail de demande ou de réponse via la fonction Edge
 * `send-transfer-mail` (voir supabase/functions/send-transfer-mail).
 * Un échec de mail n'annule jamais l'action : la notification in-app
 * reste la trace de référence.
 */
export async function sendTransferMail(transferId, kind) {
  try {
    await supabase.functions.invoke('send-transfer-mail', { body: { transferId, kind } });
  } catch {
    // mail non envoyé : silencieux, la notification in-app existe déjà
  }
}

// --- Cadenas -------------------------------------------------------------

/** Ensemble des cadenas posés sur l'arbre, sous la forme "kind:id". */
export async function fetchLockKeys(treeId) {
  const { data, error } = await supabase
    .from('record_locks')
    .select('target_kind, target_id')
    .eq('tree_id', treeId);
  if (error) throw error;
  return new Set((data || []).map((row) => `${row.target_kind}:${row.target_id}`));
}

/** Pose (locked = true) ou retire (false) un cadenas. Propriétaire uniquement (base). */
export async function setLock(treeId, kind, targetId, locked, userId) {
  if (locked) {
    const { error } = await supabase
      .from('record_locks')
      .insert({ tree_id: treeId, target_kind: kind, target_id: targetId, locked_by: userId });
    if (error) throw error;
  } else {
    const { error } = await supabase
      .from('record_locks')
      .delete()
      .eq('target_kind', kind)
      .eq('target_id', targetId);
    if (error) throw error;
  }
}

// --- Suppression de fiche (propriétaire) ---------------------------------

export async function deleteIndividual(individualId) {
  const { error } = await supabase.rpc('delete_individual', { p_individual_id: individualId });
  if (error) throw error;
}

/** Identifiant du propriétaire de l'arbre (lecture autorisée à tout membre). */
export async function fetchTreeOwnerId(treeId) {
  const { data, error } = await supabase.from('trees').select('owner_id').eq('id', treeId).maybeSingle();
  if (error) throw error;
  return data?.owner_id ?? null;
}

/** Renomme l'arbre (admin ; voir settingsMutations.updateTreeName). */
export async function renameTree(treeId, name) {
  const clean = String(name || '').trim();
  if (!clean) throw new Error('Le nom ne peut pas être vide.');
  const { error } = await supabase.from('trees').update({ name: clean }).eq('id', treeId);
  if (error) throw error;
}
