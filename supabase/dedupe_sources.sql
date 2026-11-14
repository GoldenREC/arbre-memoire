-- =====================================================================
-- DÉDOUBLONNAGE DES SOURCES — à exécuter une fois dans l'éditeur SQL de
-- Supabase (après merge_dedupe_events.sql). Peut être relancé sans risque.
--
-- Pourquoi des doublons : chaque import et chaque fusion de fiches créait
-- ou rapatriait une source par preuve, sans vérifier qu'une source
-- identique existait déjà pour le même événement. Le nettoyage des
-- événements en double a ensuite regroupé les citations, en laissant
-- derrière lui des sources jumelles (parfois sans plus aucune citation).
--
-- Règle, volontairement prudente :
--  1. Deux sources sont fusionnées seulement si elles sont identiques
--     (titre, type, dépôt, cote, lien, notes) ET citées par le même
--     événement (ou la même personne). Deux homonymes ayant chacun leur
--     "Acte de décès — Jean Dupont" ne sont donc jamais confondus.
--     On garde celle qui porte un scan, sinon la plus ancienne ; ses
--     citations et ses scans récupèrent ceux de l'autre.
--  2. Une source qui n'est plus citée nulle part et ne porte aucun scan
--     est supprimée si une source identique existe.
-- Aucun fichier scanné n'est supprimé.
-- =====================================================================

create or replace function cleanup_tree_source_duplicates(p_tree_id uuid)
returns integer
language plpgsql security definer set search_path = public as $$
declare
  v_keep uuid;
  v_remove uuid;
  v_removed integer := 0;
  v_orphans integer;
begin
  if not is_tree_family_or_admin(p_tree_id) then
    raise exception 'Droits insuffisants pour nettoyer les sources de cet arbre.';
  end if;

  loop
    select s1.id, s2.id into v_keep, v_remove
    from sources s1
    join sources s2
      on s2.tree_id = s1.tree_id
     and s2.id <> s1.id
     and lower(btrim(s2.title)) = lower(btrim(s1.title))
     and s2.source_type is not distinct from s1.source_type
     and coalesce(btrim(s2.repository), '') = coalesce(btrim(s1.repository), '')
     and coalesce(btrim(s2.call_number), '') = coalesce(btrim(s1.call_number), '')
     and coalesce(btrim(s2.url), '') = coalesce(btrim(s1.url), '')
     and coalesce(btrim(s2.notes), '') = coalesce(btrim(s1.notes), '')
    where s1.tree_id = p_tree_id
      and exists (
        select 1
        from citations a
        join citations b
          on (a.event_id is not null and a.event_id = b.event_id)
          or (a.event_id is null and b.event_id is null and a.individual_id = b.individual_id)
        where a.source_id = s1.id and b.source_id = s2.id
      )
    order by
      (exists (select 1 from media m where m.source_id = s1.id)) desc,
      s1.created_at asc,
      s1.id asc
    limit 1;

    exit when v_keep is null;

    update media set source_id = v_keep where source_id = v_remove;
    update citations set source_id = v_keep where source_id = v_remove;

    -- Citations devenues redondantes sur la source conservée : même
    -- événement, même personne — on garde celle qui porte une
    -- transcription (ou la plus ancienne si elles sont identiques).
    delete from citations c
    using citations c2
    where c.source_id = v_keep
      and c2.source_id = v_keep
      and c.id <> c2.id
      and c.event_id is not distinct from c2.event_id
      and c.individual_id is not distinct from c2.individual_id
      and (
        (coalesce(btrim(c.transcription), '') = '' and coalesce(btrim(c2.transcription), '') <> '')
        or (coalesce(btrim(c.transcription), '') = coalesce(btrim(c2.transcription), '') and c.id > c2.id)
      );

    delete from sources where id = v_remove;
    v_removed := v_removed + 1;
    v_keep := null;
    v_remove := null;
  end loop;

  -- Sources jumelles restées sans citation ni scan.
  delete from sources s
  where s.tree_id = p_tree_id
    and not exists (select 1 from citations c where c.source_id = s.id)
    and not exists (select 1 from media m where m.source_id = s.id)
    and exists (
      select 1 from sources s2
      where s2.tree_id = s.tree_id
        and s2.id <> s.id
        and lower(btrim(s2.title)) = lower(btrim(s.title))
        and s2.source_type is not distinct from s.source_type
        and coalesce(btrim(s2.repository), '') = coalesce(btrim(s.repository), '')
        and coalesce(btrim(s2.call_number), '') = coalesce(btrim(s.call_number), '')
        and coalesce(btrim(s2.url), '') = coalesce(btrim(s.url), '')
        and coalesce(btrim(s2.notes), '') = coalesce(btrim(s.notes), '')
        and (
          exists (select 1 from citations c where c.source_id = s2.id)
          or exists (select 1 from media m where m.source_id = s2.id)
          or s2.id < s.id
        )
    );
  get diagnostics v_orphans = row_count;

  return v_removed + v_orphans;
end;
$$;
grant execute on function cleanup_tree_source_duplicates(uuid) to authenticated;
