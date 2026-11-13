-- =====================================================================
-- ROW LEVEL SECURITY — Admin / Famille / Invité
-- À exécuter après schema.sql
-- =====================================================================

alter table trees              enable row level security;
alter table tree_members       enable row level security;
alter table places             enable row level security;
alter table individuals        enable row level security;
alter table unions             enable row level security;
alter table union_partners     enable row level security;
alter table filiations         enable row level security;
alter table events             enable row level security;
alter table sources            enable row level security;
alter table citations          enable row level security;
alter table media              enable row level security;
alter table media_links        enable row level security;
alter table media_face_tags    enable row level security;
alter table pets               enable row level security;
alter table pet_links          enable row level security;
alter table import_batches     enable row level security;
alter table audit_findings     enable row level security;

-- ---------------------------------------------------------------------
-- Fonctions utilitaires (SECURITY DEFINER pour éviter la récursion RLS)
-- ---------------------------------------------------------------------
create or replace function is_tree_member(p_tree_id uuid)
returns boolean language sql security definer stable as $$
  select exists (
    select 1 from tree_members
    where tree_id = p_tree_id and user_id = auth.uid()
  );
$$;

create or replace function tree_role(p_tree_id uuid)
returns app_role language sql security definer stable as $$
  select role from tree_members
  where tree_id = p_tree_id and user_id = auth.uid()
  limit 1;
$$;

create or replace function is_tree_admin(p_tree_id uuid)
returns boolean language sql security definer stable as $$
  select tree_role(p_tree_id) = 'admin';
$$;

create or replace function is_tree_family_or_admin(p_tree_id uuid)
returns boolean language sql security definer stable as $$
  select tree_role(p_tree_id) in ('admin', 'family');
$$;

-- ---------------------------------------------------------------------
-- TREES
-- ---------------------------------------------------------------------
create policy "trees: membres peuvent lire" on trees
  for select using (is_tree_member(id));

create policy "trees: owner peut tout faire" on trees
  for all using (owner_id = auth.uid());

-- ---------------------------------------------------------------------
-- TREE_MEMBERS
-- ---------------------------------------------------------------------
create policy "members: lisible par les membres" on tree_members
  for select using (is_tree_member(tree_id));

create policy "members: gérés par les admins" on tree_members
  for insert with check (is_tree_admin(tree_id));
create policy "members: modifiables par les admins" on tree_members
  for update using (is_tree_admin(tree_id));
create policy "members: supprimables par les admins" on tree_members
  for delete using (is_tree_admin(tree_id));

-- ---------------------------------------------------------------------
-- GABARIT générique appliqué à chaque table "métier" liée à tree_id :
--   - lecture : tout membre (admin/family/guest)
--   - écriture : admin et family (les invités sont en lecture seule)
-- NB : le masquage des personnes vivantes pour les invités / visiteurs
-- non connectés se fait côté application via v_individuals_with_privacy
-- + vérification du rôle, car une politique RLS colonne-par-colonne est
-- plus difficile à exprimer proprement ici. À renforcer en phase 2 avec
-- une politique dédiée sur `individuals` si besoin d'un blocage strict
-- côté base de données plutôt que côté application.
-- ---------------------------------------------------------------------

create policy "places: lecture membres"   on places   for select using (is_tree_member(tree_id));
create policy "places: écriture admin/famille" on places for all using (is_tree_family_or_admin(tree_id));

create policy "individuals: lecture membres" on individuals for select using (is_tree_member(tree_id));
create policy "individuals: écriture admin/famille" on individuals for all using (is_tree_family_or_admin(tree_id));

create policy "unions: lecture membres" on unions for select using (is_tree_member(tree_id));
create policy "unions: écriture admin/famille" on unions for all using (is_tree_family_or_admin(tree_id));

create policy "union_partners: lecture membres" on union_partners for select
  using (exists (select 1 from unions u where u.id = union_id and is_tree_member(u.tree_id)));
create policy "union_partners: écriture admin/famille" on union_partners for all
  using (exists (select 1 from unions u where u.id = union_id and is_tree_family_or_admin(u.tree_id)));

create policy "filiations: lecture membres" on filiations for select using (is_tree_member(tree_id));
create policy "filiations: écriture admin/famille" on filiations for all using (is_tree_family_or_admin(tree_id));

create policy "events: lecture membres" on events for select using (is_tree_member(tree_id));
create policy "events: écriture admin/famille" on events for all using (is_tree_family_or_admin(tree_id));

create policy "sources: lecture membres" on sources for select using (is_tree_member(tree_id));
create policy "sources: écriture admin/famille" on sources for all using (is_tree_family_or_admin(tree_id));

create policy "citations: lecture membres" on citations for select using (is_tree_member(tree_id));
create policy "citations: écriture admin/famille" on citations for all using (is_tree_family_or_admin(tree_id));

create policy "media: lecture membres" on media for select using (is_tree_member(tree_id));
create policy "media: écriture admin/famille" on media for all using (is_tree_family_or_admin(tree_id));

create policy "media_links: lecture membres" on media_links for select
  using (exists (select 1 from media m where m.id = media_id and is_tree_member(m.tree_id)));
create policy "media_links: écriture admin/famille" on media_links for all
  using (exists (select 1 from media m where m.id = media_id and is_tree_family_or_admin(m.tree_id)));

create policy "media_face_tags: lecture membres" on media_face_tags for select
  using (exists (select 1 from media m where m.id = media_id and is_tree_member(m.tree_id)));
create policy "media_face_tags: écriture admin/famille" on media_face_tags for all
  using (exists (select 1 from media m where m.id = media_id and is_tree_family_or_admin(m.tree_id)));

create policy "pets: lecture membres" on pets for select using (is_tree_member(tree_id));
create policy "pets: écriture admin/famille" on pets for all using (is_tree_family_or_admin(tree_id));

create policy "pet_links: lecture membres" on pet_links for select
  using (exists (select 1 from pets p where p.id = pet_id and is_tree_member(p.tree_id)));
create policy "pet_links: écriture admin/famille" on pet_links for all
  using (exists (select 1 from pets p where p.id = pet_id and is_tree_family_or_admin(p.tree_id)));

create policy "import_batches: lecture membres" on import_batches for select using (is_tree_member(tree_id));
create policy "import_batches: écriture admin" on import_batches for all using (is_tree_admin(tree_id));

create policy "audit_findings: lecture membres" on audit_findings for select using (is_tree_member(tree_id));
create policy "audit_findings: écriture admin/famille" on audit_findings for all using (is_tree_family_or_admin(tree_id));

-- ---------------------------------------------------------------------
-- BOOTSTRAP : création du premier arbre + de son admin.
-- Problème de l'oeuf et de la poule : pour insérer dans tree_members il
-- faut déjà être admin du tree_id... impossible au tout premier arbre.
-- On passe donc par une fonction SECURITY DEFINER (contourne RLS, mais
-- ne fait que créer un arbre appartenant à l'appelant + sa propre
-- adhésion admin : aucune élévation de privilège sur les données d'un
-- tiers n'est possible via cette fonction).
-- ---------------------------------------------------------------------
create or replace function create_tree_with_admin(p_name text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tree_id uuid;
begin
  insert into trees (name, owner_id) values (p_name, auth.uid()) returning id into v_tree_id;
  insert into tree_members (tree_id, user_id, role) values (v_tree_id, auth.uid(), 'admin');
  return v_tree_id;
end;
$$;

grant execute on function create_tree_with_admin(text) to authenticated;
