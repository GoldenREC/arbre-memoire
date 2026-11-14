-- =====================================================================
-- DURCISSEMENT — fixe le search_path des fonctions "security definer"
-- qui n'en avaient pas (recommandation Supabase : sans lui, une fonction
-- privilégiée résout ses tables selon le search_path de l'appelant).
--
-- Facultatif et sans effet visible : ne change ni les droits ni les
-- résultats. À exécuter une fois dans l'éditeur SQL de Supabase ; peut
-- être relancé sans risque.
-- =====================================================================

alter function is_tree_member(uuid) set search_path = public;
alter function tree_role(uuid) set search_path = public;
alter function is_tree_admin(uuid) set search_path = public;
alter function is_tree_family_or_admin(uuid) set search_path = public;
alter function get_invitation_preview(uuid) set search_path = public;
