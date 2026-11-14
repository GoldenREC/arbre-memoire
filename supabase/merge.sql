-- =====================================================================
-- FUSION DE DOUBLONS — réaffecte toutes les relations d'une fiche
-- individu dupliquée vers la fiche à conserver, puis supprime le
-- doublon. Déclenché depuis Audit → constat "Doublon potentiel" →
-- bouton "Fusionner" (voir src/features/stats/mergeDuplicates.js).
-- À exécuter une fois, en plus de schema.sql / policies.sql /
-- realtime.sql / storage.sql / map.sql / settings.sql.
-- =====================================================================

-- Fusionne deux fiches individu qui représentent en réalité la même
-- personne (cas typique : un même GEDCOM importé deux fois dans le même
-- arbre). Toutes les relations de p_remove_id (filiations, union,
-- médias, animaux, branches suivies, événements, citations,
-- notifications, "De Cujus" par défaut) sont transférées vers
-- p_keep_id, puis la fiche p_remove_id est supprimée.
--
-- Les champs d'état civil (prénoms, nom, dates...) ne sont PAS
-- fusionnés ici : l'application écrit d'abord le résultat choisi par
-- l'utilisateur sur individuals.id = p_keep_id (voir
-- mergeLiveIndividuals + updateIndividualCivilInfo côté JS), puis
-- appelle cette fonction pour le nettoyage relationnel.
--
-- Pour chaque table qui porte une contrainte unique/PK incluant
-- l'individu (union_partners, filiations à deux reprises, media_links,
-- pet_links, followed_individuals), on réaffecte d'abord les lignes qui
-- ne provoqueraient pas de doublon, puis on supprime les lignes
-- restantes : cela signifie que p_keep_id avait déjà la même relation,
-- donc rien n'est perdu, c'est bien un doublon de la relation elle-même.
-- Les tables sans contrainte d'unicité sur l'individu (events,
-- citations, media_face_tags, notifications, tree_members) sont
-- réaffectées directement. record_history (journal polymorphe, sans
-- clé étrangère réelle vers individuals) est volontairement laissé tel
-- quel, par cohérence avec le reste de l'historique.
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
