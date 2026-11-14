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
--
-- Écrit en requêtes d'ensemble (quelques passes sur tout l'arbre) et non
-- source par source : la première version dépassait le délai d'exécution
-- de Supabase sur un arbre comptant beaucoup de doublons.
-- =====================================================================

create or replace function cleanup_tree_source_duplicates(p_tree_id uuid)
returns integer
language plpgsql security definer set search_path = public as $$
declare
  v_removed integer := 0;
  v_count integer;
begin
  if not is_tree_family_or_admin(p_tree_id) then
    raise exception 'Droits insuffisants pour nettoyer les sources de cet arbre.';
  end if;

  -- 1. Fusion des sources identiques citées par le même événement (ou la
  --    même personne). Chaque passe calcule d'un coup "source à retirer ->
  --    source à garder" pour tout l'arbre ; il en faut plusieurs seulement
  --    si une source à garder devait elle-même être retirée ailleurs.
  loop
    drop table if exists _source_merge_map;
    create temp table _source_merge_map as
    with cited as (
      select distinct c.source_id, coalesce(c.event_id::text, 'i:' || c.individual_id::text) as target
      from citations c
      where c.tree_id = p_tree_id
    ),
    described as (
      select s.id, s.created_at,
             md5(concat_ws('|', lower(btrim(s.title)), coalesce(s.source_type::text, ''),
                           coalesce(btrim(s.repository), ''), coalesce(btrim(s.call_number), ''),
                           coalesce(btrim(s.url), ''), coalesce(btrim(s.notes), ''))) as signature,
             exists (select 1 from media m where m.source_id = s.id) as has_media
      from sources s
      where s.tree_id = p_tree_id
    ),
    ranked as (
      select d.id as src,
             first_value(d.id) over (
               partition by d.signature, cited.target
               order by d.has_media desc, d.created_at asc, d.id asc
             ) as keep
      from cited
      join described d on d.id = cited.source_id
    ),
    pairs as (
      select distinct on (src) src, keep from ranked where src <> keep order by src, keep
    )
    select p.src, p.keep
    from pairs p
    where not exists (select 1 from pairs p2 where p2.src = p.keep);

    get diagnostics v_count = row_count;
    exit when v_count = 0;

    update media m set source_id = map.keep from _source_merge_map map where m.source_id = map.src;
    update citations c set source_id = map.keep from _source_merge_map map where c.source_id = map.src;
    delete from sources s using _source_merge_map map where s.id = map.src;
    v_removed := v_removed + v_count;
  end loop;
  drop table if exists _source_merge_map;

  -- 2. Citations devenues redondantes : même source, même événement, même
  --    personne. On supprime les copies au texte identique, puis celles
  --    sans transcription quand une autre en porte une. Deux citations aux
  --    transcriptions différentes sont toutes deux conservées.
  delete from citations
  where id in (
    select id from (
      select id, row_number() over (
        partition by source_id, event_id, individual_id, coalesce(btrim(transcription), '')
        order by created_at asc, id asc
      ) as rn
      from citations
      where tree_id = p_tree_id
    ) numbered
    where rn > 1
  );

  delete from citations c
  where c.tree_id = p_tree_id
    and coalesce(btrim(c.transcription), '') = ''
    and exists (
      select 1 from citations c2
      where c2.source_id = c.source_id
        and c2.event_id is not distinct from c.event_id
        and c2.individual_id is not distinct from c.individual_id
        and coalesce(btrim(c2.transcription), '') <> ''
    );

  -- 3. Sources jumelles restées sans citation ni scan : on en garde une
  --    par description identique, en priorité celle qui sert encore.
  delete from sources
  where id in (
    select id from (
      select s.id,
             (exists (select 1 from citations c where c.source_id = s.id)
              or exists (select 1 from media m where m.source_id = s.id)) as in_use,
             row_number() over (
               partition by md5(concat_ws('|', lower(btrim(s.title)), coalesce(s.source_type::text, ''),
                                          coalesce(btrim(s.repository), ''), coalesce(btrim(s.call_number), ''),
                                          coalesce(btrim(s.url), ''), coalesce(btrim(s.notes), '')))
               order by (exists (select 1 from citations c where c.source_id = s.id)
                         or exists (select 1 from media m where m.source_id = s.id)) desc,
                        s.created_at asc, s.id asc
             ) as rn
      from sources s
      where s.tree_id = p_tree_id
    ) ranked
    where rn > 1 and not in_use
  );
  get diagnostics v_count = row_count;

  return v_removed + v_count;
end;
$$;
grant execute on function cleanup_tree_source_duplicates(uuid) to authenticated;
