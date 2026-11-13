import { supabase } from '../supabaseClient.js';

/**
 * Récupère le(s) arbre(s) dont l'utilisateur courant est membre.
 */
const MEMBER_PREFERENCE_COLUMNS = `
  default_root_individual_id, ui_language, email_language, date_format,
  show_nicknames, show_professions,
  notify_new_act, notify_new_photo, notify_birthdays, notify_email, notify_inapp
`;

export async function fetchMyTrees() {
  const { data, error } = await supabase
    .from('tree_members')
    .select(`tree_id, role, ${MEMBER_PREFERENCE_COLUMNS}, trees ( id, name, privacy_threshold_years )`);
  if (error) throw error;
  return (data || []).map((row) => ({
    id: row.tree_id,
    name: row.trees?.name,
    role: row.role,
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
  }));
}

/**
 * Crée un premier arbre pour l'utilisateur courant (devient admin).
 * À appeler quand fetchMyTrees() renvoie une liste vide (premier lancement).
 */
export async function createFirstTree(name = 'Mon arbre') {
  const { data, error } = await supabase.rpc('create_tree_with_admin', { p_name: name });
  if (error) throw error;
  return data; // uuid du nouvel arbre
}
