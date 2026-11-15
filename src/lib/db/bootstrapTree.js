import { supabase } from '../supabaseClient.js';

/**
 * Récupère le(s) arbre(s) dont l'utilisateur courant est membre.
 * Le propriétaire est repéré par trees.owner_id (la base garde aussi la
 * ligne admin du propriétaire dans tree_members : voir multi_tree.sql).
 */
const MEMBER_PREFERENCE_COLUMNS = `
  default_root_individual_id, ui_language, email_language, date_format,
  show_nicknames, show_professions,
  notify_new_act, notify_new_photo, notify_birthdays, notify_email, notify_inapp
`;

export async function fetchMyTrees(userId) {
  const { data, error } = await supabase
    .from('tree_members')
    .select(`tree_id, role, ${MEMBER_PREFERENCE_COLUMNS}, trees ( id, name, owner_id, created_at, privacy_threshold_years )`);
  if (error) throw error;
  return (data || [])
    .map((row) => ({
      id: row.tree_id,
      name: row.trees?.name,
      role: row.role,
      isOwner: !!userId && row.trees?.owner_id === userId,
      createdAt: row.trees?.created_at,
      privacyThresholdYears: row.trees?.privacy_threshold_years ?? 100,
      preferences: {
        defaultRootIndividualId: row.default_root_individual_id,
        uiLanguage: row.ui_language,
        emailLanguage: row.email_language,
        dateFormat: row.date_format,
        showNicknames: row.show_nicknames,
        showProfessions: row.show_professions,
        notifyNewAct: row.notify_new_act,
        notifyNewPhoto: row.notify_new_photo,
        notifyBirthdays: row.notify_birthdays,
        notifyEmail: row.notify_email,
        notifyInapp: row.notify_inapp,
      },
    }))
    // Ordre stable : du plus ancien au plus récent (le premier arbre reste le premier).
    .sort((a, b) => (a.createdAt || '').localeCompare(b.createdAt || ''));
}

/**
 * Crée un arbre pour l'utilisateur courant (il en devient le propriétaire).
 * Renvoie l'uuid du nouvel arbre.
 */
export async function createTree(name) {
  const { data, error } = await supabase.rpc('create_tree_with_admin', { p_name: name });
  if (error) throw error;
  return data;
}

/** Premier arbre créé automatiquement quand un compte n'en a aucun. */
export function createFirstTree(name = 'Mon arbre') {
  return createTree(name);
}
