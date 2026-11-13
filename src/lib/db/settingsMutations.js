import { supabase } from '../supabaseClient.js';

/**
 * Écritures liées à Paramètres : préférences personnelles d'un membre
 * (langues, format de date, affichage, notifications, fiche-racine par
 * défaut) et réglages de l'arbre (seuil RGPD). Voir supabase/settings.sql
 * pour les colonnes et policies correspondantes, et useAuthStore.setPreferences()
 * pour la mise à jour locale après succès.
 */

const PREFERENCE_COLUMNS = {
  defaultRootIndividualId: 'default_root_individual_id',
  uiLanguage: 'ui_language',
  emailLanguage: 'email_language',
  dateFormat: 'date_format',
  showNicknames: 'show_nicknames',
  showProfessions: 'show_professions',
  notifyNewAct: 'notify_new_act',
  notifyNewPhoto: 'notify_new_photo',
  notifyBirthdays: 'notify_birthdays',
  notifyEmail: 'notify_email',
  notifyInapp: 'notify_inapp',
};

/** Met à jour un sous-ensemble des préférences du membre connecté sur l'arbre courant. */
export async function updateMemberPreferences(treeId, userId, patch) {
  const row = {};
  for (const [key, value] of Object.entries(patch)) {
    const column = PREFERENCE_COLUMNS[key];
    if (column) row[column] = value;
  }
  if (Object.keys(row).length === 0) return;
  const { error } = await supabase.from('tree_members').update(row).eq('tree_id', treeId).eq('user_id', userId);
  if (error) throw error;
}

/** Réglage du seuil RGPD de l'arbre (admin uniquement — voir policy "trees: réglages modifiables par les admins"). */
export async function updateTreePrivacyThreshold(treeId, years) {
  const { error } = await supabase.from('trees').update({ privacy_threshold_years: years }).eq('id', treeId);
  if (error) throw error;
}

/** Renomme l'arbre (admin uniquement). */
export async function updateTreeName(treeId, name) {
  const { error } = await supabase.from('trees').update({ name }).eq('id', treeId);
  if (error) throw error;
}
