-- =====================================================================
-- SUGGESTIONS — détection de coquilles probables sur les noms de
-- famille et les lieux (voir src/features/stats/suggestionsEngine.js,
-- affichées depuis Audit → section "Suggestions").
-- À exécuter une fois, en plus de schema.sql / policies.sql /
-- realtime.sql / storage.sql / map.sql / settings.sql.
-- =====================================================================

-- ---------------------------------------------------------------------
-- SUGGESTION_DISMISSALS — mémorise les suggestions ignorées par un
-- utilisateur ("Ignorer la suggestion"), pour qu'elles ne reviennent
-- pas à chaque chargement de la page Audit. suggestion_key reprend
-- l'id stable du constat tel que calculé par suggestionsEngine.js
-- (ex: "surname:<idEnfant>:ternay->cernay" ou "place:<idRare>:<idDominant>"),
-- stable tant que les fiches/lieux concernés ne changent pas.
-- ---------------------------------------------------------------------
create table suggestion_dismissals (
  id              uuid primary key default gen_random_uuid(),
  tree_id         uuid not null references trees(id) on delete cascade,
  suggestion_key  text not null,
  dismissed_at    timestamptz not null default now(),
  dismissed_by    uuid references auth.users(id),
  unique (tree_id, suggestion_key)
);
create index idx_suggestion_dismissals_tree on suggestion_dismissals(tree_id);

alter table suggestion_dismissals enable row level security;

create policy "suggestion_dismissals: lecture membres" on suggestion_dismissals
  for select using (is_tree_member(tree_id));
create policy "suggestion_dismissals: écriture admin/famille" on suggestion_dismissals
  for all using (is_tree_family_or_admin(tree_id));

-- ---------------------------------------------------------------------
-- MERGE_PLACES — fusionne deux lieux qui désignent en réalité le même
-- endroit (coquille d'orthographe repérée par detectPlaceInconsistencies :
-- ex. "Châteauneuf-la-Forêt" vs "Châteauponsac" mal saisis l'un pour
-- l'autre). Contrairement à merge_individuals (supabase/merge.sql), un
-- lieu n'est référencé que par de simples colonnes FK nullables, sans
-- contrainte d'unicité à gérer : on réaffecte directement, puis on
-- supprime le lieu en trop.
-- ---------------------------------------------------------------------
create or replace function merge_places(p_tree_id uuid, p_keep_id uuid, p_remove_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
begin
  if p_keep_id = p_remove_id then
    raise exception 'Impossible de fusionner un lieu avec lui-même.';
  end if;
  if not is_tree_family_or_admin(p_tree_id) then
    raise exception 'Droits insuffisants pour fusionner des lieux sur cet arbre.';
  end if;
  if not exists (select 1 from places where id = p_keep_id and tree_id = p_tree_id) then
    raise exception 'Lieu à conserver introuvable dans cet arbre.';
  end if;
  if not exists (select 1 from places where id = p_remove_id and tree_id = p_tree_id) then
    raise exception 'Lieu à supprimer introuvable dans cet arbre.';
  end if;

  update individuals set birth_place_id = p_keep_id where birth_place_id = p_remove_id and tree_id = p_tree_id;
  update individuals set death_place_id = p_keep_id where death_place_id = p_remove_id and tree_id = p_tree_id;
  update unions set place_id = p_keep_id where place_id = p_remove_id and tree_id = p_tree_id;
  update events set place_id = p_keep_id where place_id = p_remove_id and tree_id = p_tree_id;

  delete from places where id = p_remove_id;
end;
$$;
grant execute on function merge_places(uuid, uuid, uuid) to authenticated;
