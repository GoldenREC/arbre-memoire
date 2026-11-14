-- =====================================================================
-- CORRECTIF — doublons d'événements/actes après fusion de fiches
-- =====================================================================
-- Bug constaté : après avoir fusionné deux fiches individu représentant
-- la même personne (Audit → "Doublon potentiel" → "Fusionner", ou le
-- même mécanisme utilisé pendant la revue de doublons à l'import),
-- merge_individuals() (supabase/merge.sql) réaffecte directement tous
-- les événements (naissance, décès...) et toutes les unions de la
-- fiche supprimée vers la fiche conservée, SANS dédoublonner. Si les
-- deux fiches fusionnées avaient chacune leur propre acte de naissance/
-- décès/mariage (import redondant), la fiche conservée se retrouve
-- avec 2 ou 3 exemplaires identiques de chaque événement et de chaque
-- citation — et si chacune avait sa propre union avec le même conjoint,
-- ces unions ne sont elles-mêmes jamais fusionnées, d'où des mariages
-- en double sur la frise.
--
-- Ce fichier :
--   1. ajoute dedupe_events_for_subject(), merge_unions() et
--      merge_duplicate_unions_sharing_partners() — briques réutilisées
--      à la fois par le correctif de merge_individuals() ci-dessous et
--      par le nettoyage ponctuel ;
--   2. redéfinit merge_individuals() pour qu'elle se nettoie elle-même
--      après chaque fusion (corrige le bug pour toutes les fusions
--      futures) ;
--   3. ajoute cleanup_tree_event_duplicates(tree_id), un nettoyage en
--      un clic pour corriger les données déjà dupliquées par les
--      fusions passées (déclenché depuis Audit → bouton "Nettoyer les
--      événements en double").
--
-- À exécuter une fois, après supabase/merge.sql (et donc après
-- schema.sql / policies.sql / realtime.sql / storage.sql / map.sql /
-- settings.sql).
-- =====================================================================

-- ---------------------------------------------------------------------
-- Supprime les événements strictement redondants (même type, même
-- date, même lieu) qu'un même sujet (individu ou union) peut
-- accumuler après une fusion de fiches. Parmi chaque groupe de
-- doublons, on conserve le plus fiable : proof_level le plus élevé,
-- puis présence d'une citation, puis le plus ancien enregistré. Les
-- citations des événements supprimés sont d'abord rapatriées sur
-- l'événement conservé (aucune transcription perdue), puis les
-- citations devenues elles-mêmes des doublons exacts (même texte) sont
-- réduites à une seule.
--
-- Volontairement limité aux types d'événements qui ne devraient
-- normalement exister qu'une fois pour un même sujet (naissance,
-- décès, mariage...) — les types par nature répétables (résidence,
-- occupation, etc.) ne sont jamais touchés par cette fonction.
-- ---------------------------------------------------------------------
create or replace function dedupe_events_for_subject(p_subject_kind subject_kind, p_subject_id uuid)
returns integer
language plpgsql security definer set search_path = public as $$
declare
  grp record;
  keep_id uuid;
  v_removed integer := 0;
  v_count integer;
begin
  for grp in
    select
      event_type,
      coalesce(event_date, 'epoch'::date) as d,
      coalesce(place_id, '00000000-0000-0000-0000-000000000000'::uuid) as p
    from events
    where subject_kind = p_subject_kind and subject_id = p_subject_id
      and event_type in ('birth','death','marriage','divorce','engagement','baptism','burial')
    group by event_type, coalesce(event_date, 'epoch'::date), coalesce(place_id, '00000000-0000-0000-0000-000000000000'::uuid)
    having count(*) > 1
  loop
    select e.id into keep_id
    from events e
    where e.subject_kind = p_subject_kind and e.subject_id = p_subject_id
      and e.event_type = grp.event_type
      and coalesce(e.event_date, 'epoch'::date) = grp.d
      and coalesce(e.place_id, '00000000-0000-0000-0000-000000000000'::uuid) = grp.p
    order by
      case e.proof_level
        when 'proven_original' then 1
        when 'proven_secondary' then 2
        when 'probable' then 3
        when 'hypothesis' then 4
        when 'disproved' then 5
        else 6
      end,
      (select count(*) from citations c where c.event_id = e.id) desc,
      e.created_at asc
    limit 1;

    -- Rapatrie les citations des doublons sur l'événement conservé.
    update citations set event_id = keep_id
    where event_id in (
      select e.id from events e
      where e.subject_kind = p_subject_kind and e.subject_id = p_subject_id
        and e.event_type = grp.event_type
        and coalesce(e.event_date, 'epoch'::date) = grp.d
        and coalesce(e.place_id, '00000000-0000-0000-0000-000000000000'::uuid) = grp.p
        and e.id <> keep_id
    );

    -- Réduit les citations devenues des doublons exacts (même texte de
    -- transcription) sur l'événement conservé à une seule occurrence.
    delete from citations c
    using citations c2
    where c.event_id = keep_id and c2.event_id = keep_id
      and c.id <> c2.id
      and coalesce(c.transcription, '') = coalesce(c2.transcription, '')
      and coalesce(c.source_id::text, '') = coalesce(c2.source_id::text, '')
      and (c.created_at > c2.created_at or (c.created_at = c2.created_at and c.id > c2.id));

    delete from events e
    where e.subject_kind = p_subject_kind and e.subject_id = p_subject_id
      and e.event_type = grp.event_type
      and coalesce(e.event_date, 'epoch'::date) = grp.d
      and coalesce(e.place_id, '00000000-0000-0000-0000-000000000000'::uuid) = grp.p
      and e.id <> keep_id;
    get diagnostics v_count = row_count;
    v_removed := v_removed + v_count;
  end loop;

  return v_removed;
end;
$$;

-- ---------------------------------------------------------------------
-- Fusionne deux unions représentant le même couple (même ensemble de
-- partenaires) — cas typique après la fusion de deux fiches individu
-- qui avaient chacune leur propre union avec le même conjoint.
-- Réaffecte partenaires (en dédoublonnant), filiations parentales et
-- événements (mariage...), dédoublonne ces derniers, puis supprime
-- l'union en trop.
-- ---------------------------------------------------------------------
create or replace function merge_unions(p_tree_id uuid, p_keep_id uuid, p_remove_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
begin
  if p_keep_id = p_remove_id then
    return;
  end if;
  if not is_tree_family_or_admin(p_tree_id) then
    raise exception 'Droits insuffisants pour fusionner des unions sur cet arbre.';
  end if;
  if not exists (select 1 from unions where id = p_keep_id and tree_id = p_tree_id) then
    raise exception 'Union à conserver introuvable dans cet arbre.';
  end if;
  if not exists (select 1 from unions where id = p_remove_id and tree_id = p_tree_id) then
    raise exception 'Union à supprimer introuvable dans cet arbre.';
  end if;

  update union_partners set union_id = p_keep_id
  where union_id = p_remove_id
    and not exists (
      select 1 from union_partners up2 where up2.union_id = p_keep_id and up2.individual_id = union_partners.individual_id
    );
  delete from union_partners where union_id = p_remove_id;

  update filiations set union_id = p_keep_id where union_id = p_remove_id;

  update events set subject_id = p_keep_id where subject_kind = 'union' and subject_id = p_remove_id;

  delete from unions where id = p_remove_id;

  perform dedupe_events_for_subject('union', p_keep_id);
end;
$$;
grant execute on function merge_unions(uuid, uuid, uuid) to authenticated;

-- ---------------------------------------------------------------------
-- Repère, parmi les unions d'un arbre (ou, si p_scope_individual_id est
-- précisé, uniquement celles où figure cet individu), les groupes
-- d'unions qui partagent exactement le même ensemble de partenaires et
-- les fusionne deux à deux via merge_unions(). Retourne le nombre
-- d'unions fusionnées.
-- ---------------------------------------------------------------------
create or replace function merge_duplicate_unions_sharing_partners(p_tree_id uuid, p_scope_individual_id uuid default null)
returns integer
language plpgsql security definer set search_path = public as $$
declare
  grp record;
  v_merged integer := 0;
begin
  for grp in
    select array_agg(id order by created_at) as union_ids
    from (
      select
        un.id,
        un.created_at,
        (select string_agg(up.individual_id::text, ',' order by up.individual_id) from union_partners up where up.union_id = un.id) as partner_key
      from unions un
      where un.tree_id = p_tree_id
        and (p_scope_individual_id is null or un.id in (select union_id from union_partners where individual_id = p_scope_individual_id))
    ) x
    where partner_key is not null and partner_key <> ''
    group by partner_key
    having count(*) > 1
  loop
    for i in 2 .. array_length(grp.union_ids, 1) loop
      perform merge_unions(p_tree_id, grp.union_ids[1], grp.union_ids[i]);
      v_merged := v_merged + 1;
    end loop;
  end loop;
  return v_merged;
end;
$$;
grant execute on function merge_duplicate_unions_sharing_partners(uuid, uuid) to authenticated;

-- ---------------------------------------------------------------------
-- MERGE_INDIVIDUALS — redéfinition complète (corrige supabase/merge.sql) :
-- ajoute, à la fin de la réaffectation des partenaires d'union, la
-- fusion des unions devenues des doublons ; et, à la fin de la
-- réaffectation des événements de l'individu, le dédoublonnage de ces
-- événements. Le reste de la fonction est inchangé par rapport à la
-- version d'origine.
-- ---------------------------------------------------------------------
create or replace function merge_individuals(p_tree_id uuid, p_keep_id uuid, p_remove_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
begin
  if p_keep_id = p_remove_id then
    raise exception 'Impossible de fusionner une fiche avec elle-même.';
  end if;
  if not is_tree_family_or_admin(p_tree_id) then
    raise exception 'Droits insuffisants pour fusionner des fiches sur cet arbre.';
  end if;
  if not exists (select 1 from individuals where id = p_keep_id and tree_id = p_tree_id) then
    raise exception 'Fiche à conserver introuvable dans cet arbre.';
  end if;
  if not exists (select 1 from individuals where id = p_remove_id and tree_id = p_tree_id) then
    raise exception 'Fiche à supprimer introuvable dans cet arbre.';
  end if;

  -- Filiations où le doublon est l'enfant (contrainte unique child_id,parent_id).
  update filiations set child_id = p_keep_id
  where child_id = p_remove_id
    and not exists (
      select 1 from filiations f2 where f2.child_id = p_keep_id and f2.parent_id = filiations.parent_id
    );
  delete from filiations where child_id = p_remove_id;

  -- Filiations où le doublon est le parent (même contrainte).
  update filiations set parent_id = p_keep_id
  where parent_id = p_remove_id
    and not exists (
      select 1 from filiations f2 where f2.parent_id = p_keep_id and f2.child_id = filiations.child_id
    );
  delete from filiations where parent_id = p_remove_id;

  -- Cas limite : les deux doublons étaient aussi liés entre eux comme
  -- parent et enfant l'un de l'autre — après réaffectation ci-dessus
  -- cela donnerait une fiche "parente d'elle-même", à supprimer.
  delete from filiations where child_id = parent_id;

  -- Partenaires d'union (PK union_id, individual_id).
  update union_partners set individual_id = p_keep_id
  where individual_id = p_remove_id
    and not exists (
      select 1 from union_partners up2 where up2.union_id = union_partners.union_id and up2.individual_id = p_keep_id
    );
  delete from union_partners where individual_id = p_remove_id;

  -- CORRECTIF : deux unions distinctes peuvent désormais partager
  -- exactement les mêmes partenaires (ex: chaque doublon avait sa
  -- propre union avec le même conjoint) — on les fusionne à leur tour
  -- pour éviter des mariages dupliqués sur la frise.
  perform merge_duplicate_unions_sharing_partners(p_tree_id, p_keep_id);

  -- Rattachements de médias (PK media_id, subject_kind, subject_id).
  update media_links set subject_id = p_keep_id
  where subject_kind = 'individual' and subject_id = p_remove_id
    and not exists (
      select 1 from media_links ml2
      where ml2.media_id = media_links.media_id and ml2.subject_kind = 'individual' and ml2.subject_id = p_keep_id
    );
  delete from media_links where subject_kind = 'individual' and subject_id = p_remove_id;

  -- Rattachements d'animaux (PK pet_id, subject_kind, subject_id).
  update pet_links set subject_id = p_keep_id
  where subject_kind = 'individual' and subject_id = p_remove_id
    and not exists (
      select 1 from pet_links pl2
      where pl2.pet_id = pet_links.pet_id and pl2.subject_kind = 'individual' and pl2.subject_id = p_keep_id
    );
  delete from pet_links where subject_kind = 'individual' and subject_id = p_remove_id;

  -- Branches suivies (PK tree_id, user_id, individual_id).
  update followed_individuals set individual_id = p_keep_id
  where individual_id = p_remove_id
    and not exists (
      select 1 from followed_individuals fi2
      where fi2.tree_id = followed_individuals.tree_id and fi2.user_id = followed_individuals.user_id and fi2.individual_id = p_keep_id
    );
  delete from followed_individuals where individual_id = p_remove_id;

  -- Pas de contrainte d'unicité sur l'individu pour ces tables :
  -- réaffectation directe, sans risque de doublon de ligne.
  update events set subject_id = p_keep_id where subject_kind = 'individual' and subject_id = p_remove_id;

  -- CORRECTIF : les deux fiches fusionnées pouvaient chacune avoir leur
  -- propre acte de naissance/décès — on dédoublonne après réaffectation,
  -- en conservant le plus fiable (acte original > ... > hypothèse).
  perform dedupe_events_for_subject('individual', p_keep_id);

  update citations set individual_id = p_keep_id where individual_id = p_remove_id;
  update media_face_tags set individual_id = p_keep_id where individual_id = p_remove_id;
  update notifications set individual_id = p_keep_id where individual_id = p_remove_id;
  update tree_members set default_root_individual_id = p_keep_id where default_root_individual_id = p_remove_id;

  -- Toute relation oubliée ci-dessus est nettoyée par les "on delete
  -- cascade"/"on delete set null" déjà définis sur chaque table.
  delete from individuals where id = p_remove_id;
end;
$$;
grant execute on function merge_individuals(uuid, uuid, uuid) to authenticated;

-- ---------------------------------------------------------------------
-- CLEANUP_TREE_EVENT_DUPLICATES — nettoyage en un clic (bouton "Nettoyer
-- les événements en double" dans Audit) pour corriger les données déjà
-- dupliquées par des fusions effectuées avant ce correctif : fusionne
-- les unions en double de tout l'arbre, puis dédoublonne les
-- événements de chaque individu et de chaque union. Retourne le nombre
-- d'unions fusionnées et d'événements supprimés, pour affichage.
-- ---------------------------------------------------------------------
create or replace function cleanup_tree_event_duplicates(p_tree_id uuid)
returns table(unions_merged integer, events_removed integer)
language plpgsql security definer set search_path = public as $$
declare
  v_unions_merged integer;
  v_events_removed integer := 0;
  v_removed integer;
  ind record;
  u record;
begin
  if not is_tree_family_or_admin(p_tree_id) then
    raise exception 'Droits insuffisants pour nettoyer les doublons sur cet arbre.';
  end if;

  v_unions_merged := merge_duplicate_unions_sharing_partners(p_tree_id, null);

  for ind in select id from individuals where tree_id = p_tree_id loop
    v_removed := dedupe_events_for_subject('individual', ind.id);
    v_events_removed := v_events_removed + v_removed;
  end loop;

  for u in select id from unions where tree_id = p_tree_id loop
    v_removed := dedupe_events_for_subject('union', u.id);
    v_events_removed := v_events_removed + v_removed;
  end loop;

  return query select v_unions_merged, v_events_removed;
end;
$$;
grant execute on function cleanup_tree_event_duplicates(uuid) to authenticated;
