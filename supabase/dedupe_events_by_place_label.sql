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
