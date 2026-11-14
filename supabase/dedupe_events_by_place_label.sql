-- =====================================================================
-- DÉDOUBLONNAGE DES ÉVÉNEMENTS PAR LIBELLÉ DE LIEU — à exécuter une fois
-- dans l'éditeur SQL de Supabase (après merge_dedupe_events.sql et
-- union_milestones.sql). Peut être relancé sans risque.
--
-- La première version comparait les lieux par identifiant : deux
-- événements identiques (même type, même date) mais rattachés à deux
-- fiches "lieu" jumelles portant le même libellé n'étaient pas reconnus
-- comme doublons — d'où un même mariage affiché deux ou trois fois sur
-- une fiche et sur la carte. On compare désormais le libellé du lieu.
-- Ajoute aussi la mise en couple ('union_start') aux types dédoublonnés.
--
-- Après exécution, relancer "Nettoyer les doublons" sur la page Audit.
-- =====================================================================

create or replace function event_place_key(p_place_id uuid)
returns text
language sql stable security definer set search_path = public as $$
  select coalesce((select lower(btrim(pl.raw_label)) from places pl where pl.id = p_place_id), '');
$$;

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
      event_place_key(place_id) as p
    from events
    where subject_kind = p_subject_kind and subject_id = p_subject_id
      and event_type in ('birth','death','marriage','divorce','union_start','engagement','baptism','burial')
    group by event_type, coalesce(event_date, 'epoch'::date), event_place_key(place_id)
    having count(*) > 1
  loop
    select e.id into keep_id
    from events e
    where e.subject_kind = p_subject_kind and e.subject_id = p_subject_id
      and e.event_type = grp.event_type
      and coalesce(e.event_date, 'epoch'::date) = grp.d
      and event_place_key(e.place_id) = grp.p
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
        and event_place_key(e.place_id) = grp.p
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
      and event_place_key(e.place_id) = grp.p
      and e.id <> keep_id;
    get diagnostics v_count = row_count;
    v_removed := v_removed + v_count;
  end loop;

  return v_removed;
end;
$$;

-- ---------------------------------------------------------------------
-- CLEANUP_TREE_PLACE_DUPLICATES — fusionne les fiches "lieu" qui portent
-- exactement le même libellé (cause première des événements en double
-- non reconnus, et des lieux comptés plusieurs fois sur la carte et dans
-- les statistiques). On garde la fiche géolocalisée, sinon la plus
-- ancienne ; personnes, unions et événements sont rattachés à elle.
-- Appelée par le bouton "Nettoyer les doublons" de la page Audit.
-- ---------------------------------------------------------------------
create or replace function cleanup_tree_place_duplicates(p_tree_id uuid)
returns integer
language plpgsql security definer set search_path = public as $$
declare
  v_count integer;
begin
  if not is_tree_family_or_admin(p_tree_id) then
    raise exception 'Droits insuffisants pour nettoyer les lieux de cet arbre.';
  end if;

  drop table if exists _place_merge_map;
  create temp table _place_merge_map as
  select src, keep from (
    select p.id as src,
           first_value(p.id) over (
             partition by lower(btrim(p.raw_label))
             order by (p.latitude is not null) desc, p.created_at asc, p.id asc
           ) as keep
    from places p
    where p.tree_id = p_tree_id
  ) ranked
  where src <> keep;

  update individuals i set birth_place_id = m.keep from _place_merge_map m where i.birth_place_id = m.src;
  update individuals i set death_place_id = m.keep from _place_merge_map m where i.death_place_id = m.src;
  update unions u set place_id = m.keep from _place_merge_map m where u.place_id = m.src;
  update events e set place_id = m.keep from _place_merge_map m where e.place_id = m.src;
  delete from places p using _place_merge_map m where p.id = m.src;
  get diagnostics v_count = row_count;

  drop table if exists _place_merge_map;
  return v_count;
end;
$$;
grant execute on function cleanup_tree_place_duplicates(uuid) to authenticated;

-- ---------------------------------------------------------------------
-- CLEANUP_TREE_EVENT_DUPLICATES (nouvelle version, même signature) —
-- avant de dédoublonner, aligne les exemplaires d'un même événement
-- unique qui se contredisent, selon trois règles prudentes :
--  1. Naissance et décès : la fiche fait foi. La date et le lieu affichés
--     sur la fiche de la personne sont reportés sur tous ses événements
--     de naissance (ou de décès), qui deviennent identiques et fusionnent.
--     Les dates d'attente d'un ancien import ("1er janvier 1900, France")
--     disparaissent ainsi au profit de ce que montre la fiche.
--  2. Événement d'union sans date alors qu'un seul autre exemplaire en a
--     une : il prend cette date.
--  3. Événements d'union de même type et de même date mais aux lieux
--     écrits différemment ("La Garde, Var" / "La Garde, Var, Provence-
--     Alpes-Côte d'Azur, France") : tous prennent le lieu le plus détaillé.
-- Aucune preuve n'est perdue : les citations suivent l'événement conservé.
-- Deux mariages d'une même union à deux dates différentes ne sont pas
-- touchés : ils restent signalés dans l'Audit, à trancher à la main.
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

  -- Règle 1 : la fiche fait foi pour la naissance et le décès.
  update events e
  set event_date = i.birth_date,
      date_precision = coalesce(i.birth_date_precision, e.date_precision),
      place_id = i.birth_place_id
  from individuals i
  where i.tree_id = p_tree_id
    and e.subject_kind = 'individual' and e.subject_id = i.id and e.event_type = 'birth'
    and (i.birth_date is not null or i.birth_place_id is not null)
    and (select count(*) from events e2
         where e2.subject_kind = 'individual' and e2.subject_id = i.id and e2.event_type = 'birth') > 1;

  update events e
  set event_date = i.death_date,
      date_precision = coalesce(i.death_date_precision, e.date_precision),
      place_id = i.death_place_id
  from individuals i
  where i.tree_id = p_tree_id
    and e.subject_kind = 'individual' and e.subject_id = i.id and e.event_type = 'death'
    and (i.death_date is not null or i.death_place_id is not null)
    and (select count(*) from events e2
         where e2.subject_kind = 'individual' and e2.subject_id = i.id and e2.event_type = 'death') > 1;

  -- Règle 2 : un événement d'union sans date adopte l'unique date connue.
  update events e
  set event_date = d.only_date
  from (
    select e2.subject_id, e2.event_type, min(e2.event_date) as only_date
    from events e2
    where e2.tree_id = p_tree_id and e2.subject_kind = 'union'
      and e2.event_type in ('marriage', 'divorce', 'union_start')
    group by e2.subject_id, e2.event_type
    having count(distinct e2.event_date) = 1 and count(*) > count(e2.event_date)
  ) d
  where e.subject_kind = 'union' and e.subject_id = d.subject_id and e.event_type = d.event_type
    and e.event_date is null;

  -- Règle 3 : même type, même date -> le lieu le plus détaillé pour tous.
  update events e
  set place_id = best.place_id
  from (
    select distinct on (e2.subject_id, e2.event_type, e2.event_date)
           e2.subject_id, e2.event_type, e2.event_date, e2.place_id
    from events e2
    left join places pl on pl.id = e2.place_id
    where e2.tree_id = p_tree_id and e2.subject_kind = 'union'
      and e2.event_type in ('marriage', 'divorce', 'union_start')
    order by e2.subject_id, e2.event_type, e2.event_date,
             length(coalesce(pl.raw_label, '')) desc, e2.created_at asc, e2.id asc
  ) best
  where e.subject_kind = 'union' and e.subject_id = best.subject_id and e.event_type = best.event_type
    and e.event_date is not distinct from best.event_date
    and e.place_id is distinct from best.place_id;

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
