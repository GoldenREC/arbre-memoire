import { supabase } from '../supabaseClient.js';

/**
 * Gestion des membres et des invitations par e-mail (voir
 * supabase/settings.sql pour le schéma et les fonctions RPC).
 * Convention "pas de jointure imbriquée" : tree_members et profiles
 * sont lus séparément puis fusionnés ici, comme pour le reste du
 * projet (voir bootstrapTree.js).
 */

export const ROLE_LABELS = { admin: 'Admin', family: 'Contributeur', guest: 'Lecteur' };
export const ROLE_OPTIONS = [
  { value: 'admin', label: 'Admin', description: 'Contrôle total : membres, paramètres, toutes les fiches.' },
  { value: 'family', label: 'Contributeur', description: 'Peut ajouter et modifier les fiches.' },
  { value: 'guest', label: 'Lecteur', description: 'Consultation uniquement.' },
];

/** Membres actuels de l'arbre, avec leur e-mail (via profiles) et leur rôle. */
export async function listTreeMembers(treeId) {
  const { data: memberRows, error: memberErr } = await supabase
    .from('tree_members')
    .select('user_id, role, invited_at')
    .eq('tree_id', treeId);
  if (memberErr) throw memberErr;

  const userIds = (memberRows || []).map((m) => m.user_id);
  let emailById = new Map();
  if (userIds.length) {
    const { data: profileRows, error: profErr } = await supabase.from('profiles').select('id, email').in('id', userIds);
    if (profErr) throw profErr;
    emailById = new Map((profileRows || []).map((p) => [p.id, p.email]));
  }

  return (memberRows || [])
    .map((m) => ({ userId: m.user_id, role: m.role, email: emailById.get(m.user_id) || null, joinedAt: m.invited_at }))
    .sort((a, b) => (a.email || '').localeCompare(b.email || ''));
}

/** Invitations en attente (ou récentes) pour l'arbre — lecture admin uniquement (RLS). */
export async function listTreeInvitations(treeId) {
  const { data, error } = await supabase
    .from('tree_invitations')
    .select('id, email, role, token, status, created_at, expires_at, accepted_at')
    .eq('tree_id', treeId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data || [];
}

/** Crée une invitation ; renvoie la ligne créée (avec son token) pour générer le lien à partager manuellement. */
export async function createInvitation(treeId, email, role) {
  const { data, error } = await supabase
    .from('tree_invitations')
    .insert({ tree_id: treeId, email: email.trim().toLowerCase(), role })
    .select('id, email, role, token, status, created_at, expires_at')
    .single();
  if (error) throw error;
  return data;
}

export async function revokeInvitation(invitationId) {
  const { error } = await supabase.from('tree_invitations').update({ status: 'revoked' }).eq('id', invitationId);
  if (error) throw error;
}

export function invitationLink(token) {
  return `${window.location.origin}/invite/${token}`;
}

export async function updateMemberRole(treeId, userId, role) {
  const { error } = await supabase.from('tree_members').update({ role }).eq('tree_id', treeId).eq('user_id', userId);
  if (error) throw error;
}

export async function removeMember(treeId, userId) {
  const { error } = await supabase.from('tree_members').delete().eq('tree_id', treeId).eq('user_id', userId);
  if (error) throw error;
}

/** Aperçu public d'une invitation (nom de l'arbre, rôle, statut) — lisible sans connexion. */
export async function getInvitationPreview(token) {
  const { data, error } = await supabase.rpc('get_invitation_preview', { p_token: token });
  if (error) throw error;
  return data?.[0] || null;
}

/** Accepte l'invitation pour l'utilisateur actuellement connecté ; renvoie l'id de l'arbre rejoint. */
export async function acceptInvitation(token) {
  const { data, error } = await supabase.rpc('accept_invitation', { p_token: token });
  if (error) throw error;
  return data;
}
