-- =====================================================================
-- MULTI-ARBRES, RÔLES (propriétaire / admin / membre), TRANSFERTS DE
-- PROPRIÉTÉ ET CADENAS.
-- À exécuter UNE FOIS dans l'éditeur SQL Supabase, après schema.sql,
-- policies.sql, realtime.sql, storage.sql, map.sql et settings.sql.
--
-- Principes :
--   - Le propriétaire est désigné par trees.owner_id. Dans tree_members,
--     il a aussi la ligne 'admin' (on ne touche pas à l'énum app_role).
--   - 'family' (ancien "Contributeur") disparaît : migré en 'admin'.
--   - 'guest' devient "Membre" (lecture seule).
--   - Seul le propriétaire : supprime une fiche ou l'arbre, pose ou
--     retire les cadenas, change les rôles, transfère la propriété.
--   - Les admins créent et modifient, mais ne suppriment pas de fiches.
--   - Les règles de cadenas sont appliquées par des triggers : même une
--     requête directe à l'API ne peut pas les contourner.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. MIGRATION DES RÔLES EXISTANTS
-- ---------------------------------------------------------------------
update tree_members set role = 'admin' where role = 'family';
update tree_invitations set role = 'admin' where role = 'family';

-- Le compte propriétaire ne peut plus disparaître tant qu'il possède
-- un arbre : supprimer le compte exige d'abord de transférer ou de
-- supprimer chacun de ses arbres (sinon la cascade effacerait l'arbre).
alter table trees drop constraint if exists trees_owner_id_fkey;
alter table trees add constraint trees_owner_id_fkey
  foreign key (owner_id) references auth.users(id) on delete restrict;

-- ---------------------------------------------------------------------
-- 2. FONCTIONS DE RÔLE
-- ---------------------------------------------------------------------
create or replace function is_tree_owner(p_tree_id uuid)
returns boolean language sql security definer stable set search_path = public as $$
  select exists (select 1 from trees where id = p_tree_id and owner_id = auth.uid());
$$;

-- is_tree_admin / is_tree_family_or_admin / is_tree_member restent telles
-- quelles : le propriétaire a la ligne 'admin', donc il satisfait déjà
-- toutes les règles d'admin.

-- ---------------------------------------------------------------------
-- 3. GARDE-FOUS SUR LES ARBRES ET LES MEMBRES
-- ---------------------------------------------------------------------

-- Seule la fonction de transfert peut changer le propriétaire. Sans
-- cette garde, un admin pourrait se désigner propriétaire via la policy
-- de mise à jour existante ("réglages modifiables par les admins").
create or replace function guard_tree_owner()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.owner_id is distinct from old.owner_id
     and coalesce(current_setting('app.transfer_allowed', true), '') <> '1' then
    raise exception 'La propriété d''un arbre ne se transfère que par la procédure officielle.';
  end if;
  return new;
end;
$$;
drop trigger if exists trg_guard_tree_owner on trees;
create trigger trg_guard_tree_owner before update on trees
  for each row execute function guard_tree_owner();

-- Un rôle ne change que par le propriétaire, ou par la rétrogradation
-- volontaire d'un admin (fonction self_downgrade_admin). Le propriétaire
-- garde toujours le rôle admin : il ne se rétrograde pas, il transfère.
create or replace function guard_tree_members()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_owner uuid;
  v_tree uuid;
begin
  -- En DELETE, NEW n'existe pas : on ne lit que OLD.
  v_tree := case when tg_op = 'DELETE' then old.tree_id else new.tree_id end;
  if not exists (select 1 from trees where id = v_tree) then
    -- suppression en cascade de l'arbre lui-même : rien à garder
    if tg_op = 'DELETE' then return old; end if;
    return new;
  end if;
  select owner_id into v_owner from trees where id = v_tree;

  if tg_op = 'DELETE' then
    if old.user_id = v_owner then
      raise exception 'Impossible de retirer le propriétaire. Pour supprimer ce compte, transfère d''abord la propriété de chacun de ses arbres, ou supprime-les.';
    end if;
    return old;
  end if;

  if new.role is distinct from old.role then
    if old.user_id = v_owner and new.role <> 'admin' then
      raise exception 'Le rôle du propriétaire ne peut pas être modifié.';
    end if;
    if coalesce(current_setting('app.role_change_allowed', true), '') <> '1'
       and not is_tree_owner(new.tree_id) then
      raise exception 'Seul le propriétaire peut changer les rôles.';
    end if;
  end if;
  return new;
end;
$$;
drop trigger if exists trg_guard_tree_members on tree_members;
create trigger trg_guard_tree_members before update or delete on tree_members
  for each row execute function guard_tree_members();

-- ---------------------------------------------------------------------
-- 4. POLICIES DES MEMBRES ET DES INVITATIONS
-- ---------------------------------------------------------------------
drop policy if exists "members: gérés par les admins" on tree_members;
drop policy if exists "members: modifiables par les admins" on tree_members;
drop policy if exists "members: supprimables par les admins" on tree_members;

-- Un admin invite comme membre ; seul le propriétaire ajoute un admin.
create policy "members: ajout (admin = membre, propriétaire = tout)" on tree_members
  for insert with check (
    is_tree_owner(tree_id) or (is_tree_admin(tree_id) and role = 'guest')
  );
-- Promotion / rétrogradation : propriétaire uniquement (la garde ci-dessus
-- autorise aussi la rétrogradation volontaire d'un admin).
create policy "members: rôles modifiables par le propriétaire" on tree_members
  for update using (is_tree_owner(tree_id)) with check (is_tree_owner(tree_id));
-- Retrait : le propriétaire retire qui il veut (sauf lui-même, garde ci-dessus) ;
-- un admin peut retirer un simple membre.
create policy "members: retrait" on tree_members
  for delete using (
    is_tree_owner(tree_id) or (is_tree_admin(tree_id) and role = 'guest')
  );

drop policy if exists "invitations: création admin" on tree_invitations;
create policy "invitations: création (admin = membre, propriétaire = tout)" on tree_invitations
  for insert with check (
    is_tree_owner(tree_id) or (is_tree_admin(tree_id) and role = 'guest')
  );

-- ---------------------------------------------------------------------
-- 5. SUPPRESSION DE FICHES RÉSERVÉE AU PROPRIÉTAIRE
-- Les admins gardent l'écriture (create/update) ; seul le propriétaire
-- supprime une fiche. On remplace la policy "for all" par trois policies.
-- ---------------------------------------------------------------------
drop policy if exists "individuals: écriture admin/famille" on individuals;
create policy "individuals: création admin" on individuals for insert
  with check (is_tree_family_or_admin(tree_id));
create policy "individuals: modification admin" on individuals for update
  using (is_tree_family_or_admin(tree_id)) with check (is_tree_family_or_admin(tree_id));
create policy "individuals: suppression propriétaire" on individuals for delete
  using (is_tree_owner(tree_id));

-- ---------------------------------------------------------------------
-- 6. TRANSFERTS DE PROPRIÉTÉ
-- ---------------------------------------------------------------------
create table if not exists ownership_transfers (
  id           uuid primary key default gen_random_uuid(),
  tree_id      uuid not null references trees(id) on delete cascade,
  from_user    uuid not null references auth.users(id) on delete cascade,
  to_user      uuid not null references auth.users(id) on delete cascade,
  status       text not null default 'pending'
               check (status in ('pending','accepted','refused','cancelled','expired')),
  created_at   timestamptz not null default now(),
  expires_at   timestamptz not null default (now() + interval '7 days'),
  responded_at timestamptz
);
-- Une seule demande en attente à la fois par arbre.
create unique index if not exists idx_ownership_one_pending
  on ownership_transfers(tree_id) where status = 'pending';

alter table ownership_transfers enable row level security;
create policy "transfers: lecture par les deux parties" on ownership_transfers
  for select using (from_user = auth.uid() or to_user = auth.uid());
-- Aucune écriture directe : tout passe par les fonctions ci-dessous.

-- Le cadre d'accès au texte de confirmation est volontairement exact.
create or replace function ownership_confirmation_phrase(p_email text)
returns text language sql immutable as $$
  select 'je souhaite transférer la propriété de cet arbre au propriétaire de l''adresse mail ' || lower(trim(p_email));
$$;

create or replace function request_ownership_transfer(p_tree_id uuid, p_target_email text, p_confirmation text)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_target uuid;
  v_id uuid;
begin
  if not is_tree_owner(p_tree_id) then
    raise exception 'Seul le propriétaire peut transférer l''arbre.';
  end if;

  select tm.user_id into v_target
  from tree_members tm join auth.users u on u.id = tm.user_id
  where tm.tree_id = p_tree_id and lower(u.email) = lower(trim(p_target_email))
    and tm.role = 'admin' and tm.user_id <> auth.uid()
  limit 1;
  if v_target is null then
    raise exception 'Le destinataire doit être un admin de cet arbre.';
  end if;

  if trim(p_confirmation) <> ownership_confirmation_phrase(p_target_email) then
    raise exception 'Le texte de confirmation ne correspond pas.';
  end if;

  -- Une nouvelle demande remplace une éventuelle demande en attente.
  update ownership_transfers set status = 'cancelled', responded_at = now()
  where tree_id = p_tree_id and status = 'pending';

  insert into ownership_transfers (tree_id, from_user, to_user)
  values (p_tree_id, auth.uid(), v_target)
  returning id into v_id;

  insert into notifications (tree_id, user_id, kind, title, body, link)
  values (p_tree_id, v_target, 'ownership_transfer', 'Demande de transfert de propriété',
          'Un propriétaire souhaite te transférer la propriété de cet arbre. Tu peux accepter ou refuser.',
          '/parametres/membres');

  return v_id;
end;
$$;
grant execute on function request_ownership_transfer(uuid, text, text) to authenticated;

create or replace function respond_ownership_transfer(p_transfer_id uuid, p_accept boolean)
returns text
language plpgsql security definer set search_path = public as $$
declare
  v_t ownership_transfers%rowtype;
begin
  select * into v_t from ownership_transfers where id = p_transfer_id for update;
  if not found or v_t.to_user <> auth.uid() then
    raise exception 'Cette demande ne te concerne pas.';
  end if;
  if v_t.status <> 'pending' then
    raise exception 'Cette demande n''est plus en attente.';
  end if;
  if v_t.expires_at < now() then
    update ownership_transfers set status = 'expired' where id = v_t.id;
    raise exception 'Cette demande de transfert a expiré.';
  end if;
  if not exists (select 1 from tree_members where tree_id = v_t.tree_id and user_id = v_t.to_user and role = 'admin') then
    raise exception 'Tu dois être admin de cet arbre pour accepter.';
  end if;

  if p_accept then
    perform set_config('app.transfer_allowed', '1', true);
    update trees set owner_id = v_t.to_user where id = v_t.tree_id;
    update ownership_transfers set status = 'accepted', responded_at = now() where id = v_t.id;
  else
    update ownership_transfers set status = 'refused', responded_at = now() where id = v_t.id;
  end if;

  insert into notifications (tree_id, user_id, kind, title, body, link)
  values (v_t.tree_id, v_t.from_user, 'ownership_transfer',
          case when p_accept then 'Transfert de propriété accepté' else 'Transfert de propriété refusé' end,
          case when p_accept then 'L''admin a accepté de devenir propriétaire. Tu es maintenant admin de cet arbre.'
               else 'L''admin a refusé le transfert. Tu restes propriétaire.' end,
          '/parametres/membres');

  return case when p_accept then 'accepted' else 'refused' end;
end;
$$;
grant execute on function respond_ownership_transfer(uuid, boolean) to authenticated;

create or replace function cancel_ownership_transfer(p_transfer_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
begin
  update ownership_transfers set status = 'cancelled', responded_at = now()
  where id = p_transfer_id and status = 'pending' and from_user = auth.uid();
  if not found then
    raise exception 'Demande introuvable ou déjà traitée.';
  end if;
end;
$$;
grant execute on function cancel_ownership_transfer(uuid) to authenticated;

-- ---------------------------------------------------------------------
-- 7. RÉTROGRADATION VOLONTAIRE D'UN ADMIN
-- ---------------------------------------------------------------------
create or replace function self_downgrade_admin(p_tree_id uuid, p_confirmation text)
returns void
language plpgsql security definer set search_path = public as $$
begin
  if trim(p_confirmation) <> 'je souhaite devenir membre de cet arbre' then
    raise exception 'Le texte de confirmation ne correspond pas.';
  end if;
  if is_tree_owner(p_tree_id) then
    raise exception 'Le propriétaire ne peut pas se rétrograder : il doit transférer l''arbre.';
  end if;
  if not is_tree_admin(p_tree_id) then
    raise exception 'Tu n''es pas admin de cet arbre.';
  end if;
  perform set_config('app.role_change_allowed', '1', true);
  update tree_members set role = 'guest' where tree_id = p_tree_id and user_id = auth.uid();
end;
$$;
grant execute on function self_downgrade_admin(uuid, text) to authenticated;

-- ---------------------------------------------------------------------
-- 8. CADENAS
-- Un cadenas est posé par le propriétaire sur une fiche ('individual'),
-- un acte ou permalien ('media'), ou un événement ('event').
-- ---------------------------------------------------------------------
create table if not exists record_locks (
  tree_id     uuid not null references trees(id) on delete cascade,
  target_kind text not null check (target_kind in ('individual','media','event')),
  target_id   uuid not null,
  locked_by   uuid references auth.users(id) on delete set null,
  locked_at   timestamptz not null default now(),
  primary key (target_kind, target_id)
);
alter table record_locks enable row level security;
create policy "locks: lecture membres" on record_locks for select using (is_tree_member(tree_id));
create policy "locks: pose par le propriétaire" on record_locks for insert
  with check (is_tree_owner(tree_id) and locked_by = auth.uid());
create policy "locks: retrait par le propriétaire" on record_locks for delete
  using (is_tree_owner(tree_id));

-- Cascade DIRECTE (choix du propriétaire) :
--  * une fiche cadenassée protège : ses événements, ses actes (médias liés
--    et actes cités), et la fiche de son/ses conjoint(s) lié(s) par un
--    événement de mariage ;
--  * la protection ne va pas plus loin : le conjoint d'un conjoint n'est
--    pas protégé par ce seul lien.

-- Cadenas posé sur la fiche elle-même.
create or replace function individual_direct_locked(p_ind uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from record_locks where target_kind = 'individual' and target_id = p_ind);
$$;

-- Conjoints liés à p_ind par une union dont un événement de mariage existe.
create or replace function spouses_of(p_ind uuid)
returns setof uuid language sql stable security definer set search_path = public as $$
  select up2.individual_id
  from union_partners up1
  join union_partners up2 on up2.union_id = up1.union_id
                         and up2.individual_id <> up1.individual_id
  where up1.individual_id = p_ind
    and exists (select 1 from events e where e.subject_kind = 'union'
                  and e.subject_id = up1.union_id and e.event_type = 'marriage');
$$;

-- Fiche protégée : cadenassée elle-même, ou conjoint direct (mariage)
-- d'une fiche cadenassée elle-même.
create or replace function individual_locked(p_ind uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select individual_direct_locked(p_ind)
    or exists (select 1 from spouses_of(p_ind) s where individual_direct_locked(s));
$$;

-- Événement cadenassé : lui-même, ou événement d'une fiche protégée, ou
-- événement de mariage dont un conjoint est cadenassé directement.
create or replace function event_locked(p_event uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from record_locks where target_kind = 'event' and target_id = p_event)
    or exists (select 1 from events e where e.id = p_event
                 and e.subject_kind = 'individual' and individual_locked(e.subject_id))
    or exists (select 1 from events e join union_partners up on up.union_id = e.subject_id
                 where e.id = p_event and e.subject_kind = 'union'
                   and individual_direct_locked(up.individual_id));
$$;

-- Acte cadenassé : lui-même, ou lié à une fiche protégée (media_links),
-- ou cité par une fiche protégée / un événement cadenassé.
create or replace function media_locked(p_media uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from record_locks where target_kind = 'media' and target_id = p_media)
    or exists (select 1 from media_links ml
                 where ml.media_id = p_media and ml.subject_kind = 'individual'
                   and individual_locked(ml.subject_id))
    or exists (select 1 from media m join citations c on c.source_id = m.source_id
                 where m.id = p_media and (
                   (c.individual_id is not null and individual_locked(c.individual_id))
                   or (c.event_id is not null and event_locked(c.event_id))));
$$;

-- Un événement est "protégé" si un de ses actes (source d'une citation
-- de l'événement) est cadenassé, ou s'il est cadenassé lui-même.
create or replace function event_protected(p_event uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select event_locked(p_event) or exists (
    select 1 from citations c join media m on m.source_id = c.source_id
    where c.event_id = p_event and media_locked(m.id)
  );
$$;

-- Une fiche ne peut être supprimée si elle est cadenassée, ou si elle
-- contient un acte cadenassé (acte rattaché directement, ou via un de
-- ses événements / une de ses citations).
create or replace function individual_blocks_delete(p_ind uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select individual_locked(p_ind)
    or exists (select 1 from media_links ml where ml.subject_kind = 'individual'
                 and ml.subject_id = p_ind and media_locked(ml.media_id))
    or exists (select 1 from events e where e.subject_kind = 'individual'
                 and e.subject_id = p_ind and event_protected(e.id))
    or exists (select 1 from citations c join media m on m.source_id = c.source_id
                 where c.individual_id = p_ind and media_locked(m.id));
$$;

-- Gardes : chaque trigger ignore les suppressions en cascade d'un arbre
-- entier (l'arbre n'existe plus à ce moment-là).
create or replace function guard_locks_individuals()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'UPDATE' then
    if individual_locked(old.id) and not is_tree_owner(old.tree_id) then
      raise exception 'Cette fiche est cadenassée par le propriétaire.';
    end if;
    return new;
  end if;
  if not exists (select 1 from trees where id = old.tree_id) then return old; end if;
  if not is_tree_owner(old.tree_id) then
    raise exception 'Seul le propriétaire peut supprimer une fiche.';
  end if;
  if individual_blocks_delete(old.id) then
    raise exception 'Cette fiche est cadenassée, ou contient un acte cadenassé. Retire le cadenas avant de la supprimer.';
  end if;
  return old;
end;
$$;
drop trigger if exists trg_guard_locks_individuals on individuals;
create trigger trg_guard_locks_individuals before update or delete on individuals
  for each row execute function guard_locks_individuals();

create or replace function guard_locks_events()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'UPDATE' then
    if event_locked(old.id) and not is_tree_owner(old.tree_id) then
      raise exception 'Cet événement est cadenassé par le propriétaire.';
    end if;
    return new;
  end if;
  if not exists (select 1 from trees where id = old.tree_id) then return old; end if;
  if event_protected(old.id) then
    raise exception 'Cet événement est lié à un acte cadenassé. Retire le cadenas avant de le supprimer.';
  end if;
  return old;
end;
$$;
drop trigger if exists trg_guard_locks_events on events;
create trigger trg_guard_locks_events before update or delete on events
  for each row execute function guard_locks_events();

create or replace function guard_locks_media()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from trees where id = old.tree_id) then return old; end if;
  if media_locked(old.id) then
    raise exception 'Cet acte est cadenassé par le propriétaire.';
  end if;
  return old;
end;
$$;
drop trigger if exists trg_guard_locks_media on media;
create trigger trg_guard_locks_media before delete on media
  for each row execute function guard_locks_media();

-- Retirer un acte d'une fiche (media_links) ou d'un événement (citations)
-- revient à le détacher : interdit tant qu'il est cadenassé.
-- media_links n'a pas de tree_id : on remonte à l'arbre via le média.
create or replace function guard_locks_media_links()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_tree uuid;
begin
  select tree_id into v_tree from media where id = old.media_id;
  if v_tree is null or not exists (select 1 from trees where id = v_tree) then return old; end if;
  if media_locked(old.media_id) then
    raise exception 'Cet acte est cadenassé : il ne peut pas être retiré de cette fiche.';
  end if;
  return old;
end;
$$;
drop trigger if exists trg_guard_locks_media_links on media_links;
create trigger trg_guard_locks_media_links before delete on media_links
  for each row execute function guard_locks_media_links();

create or replace function guard_locks_citations()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from trees where id = old.tree_id) then return old; end if;
  if exists (select 1 from media m where m.source_id = old.source_id and media_locked(m.id)) then
    raise exception 'Cet acte est cadenassé : il ne peut pas être retiré de cet événement.';
  end if;
  return old;
end;
$$;
drop trigger if exists trg_guard_locks_citations on citations;
create trigger trg_guard_locks_citations before delete on citations
  for each row execute function guard_locks_citations();

-- ---------------------------------------------------------------------
-- 9. SUPPRESSION D'UNE FICHE (propriétaire) : nettoie les liens
-- polymorphes que les clés étrangères ne couvrent pas. Les garde-fous
-- ci-dessus s'appliquent : une fiche cadenassée reste indélétable.
-- ---------------------------------------------------------------------
create or replace function delete_individual(p_individual_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_tree uuid;
begin
  select tree_id into v_tree from individuals where id = p_individual_id;
  if v_tree is null then raise exception 'Fiche introuvable.'; end if;
  if not is_tree_owner(v_tree) then raise exception 'Seul le propriétaire peut supprimer une fiche.'; end if;
  -- Vérification anticipée : sans elle, la suppression des événements lève
  -- le mauvais message (« événement lié à un acte »).
  if individual_blocks_delete(p_individual_id) then
    raise exception 'Cette fiche est cadenassée, ou contient un acte cadenassé. Retire le cadenas avant de la supprimer.';
  end if;

  delete from events where subject_kind = 'individual' and subject_id = p_individual_id;
  delete from media_links where subject_kind = 'individual' and subject_id = p_individual_id;
  delete from pet_links where subject_kind = 'individual' and subject_id = p_individual_id;
  -- Le cadenas doit rester en place pendant la suppression : le trigger
  -- guard_locks_individuals le vérifie. On ne retire le cadenas qu'après.
  delete from individuals where id = p_individual_id;
  delete from record_locks where target_kind = 'individual' and target_id = p_individual_id;
end;
$$;
grant execute on function delete_individual(uuid) to authenticated;

-- État effectif des cadenas d'un arbre, direct ou hérité, pour l'affichage.
-- direct = cadenas posé sur l'élément ; sinon reason explique la protection.
create or replace function effective_locks(p_tree_id uuid)
returns table(target_kind text, target_id uuid, direct boolean, reason text)
language plpgsql stable security definer set search_path = public as $$
begin
  if not exists (select 1 from trees where id = p_tree_id and owner_id = auth.uid())
     and not exists (select 1 from tree_members where tree_id = p_tree_id and user_id = auth.uid()) then
    raise exception 'Accès refusé.';
  end if;

  return query
  select 'individual'::text, i.id, individual_direct_locked(i.id),
         case when individual_direct_locked(i.id) then null::text
              else 'conjoint cadenassé : ' || coalesce((
                select trim(coalesce(s.first_names,'') || ' ' || coalesce(s.last_name,''))
                from individuals s
                where s.id = (select x from spouses_of(i.id) x where individual_direct_locked(x) limit 1)
              ), 'un conjoint') end
  from individuals i
  where i.tree_id = p_tree_id and individual_locked(i.id);

  return query
  select 'event'::text, e.id, exists (select 1 from record_locks r
                                      where r.target_kind = 'event' and r.target_id = e.id),
         case when exists (select 1 from record_locks r
                           where r.target_kind = 'event' and r.target_id = e.id) then null::text
              when e.subject_kind = 'individual' then 'fiche cadenassée'
              else 'conjoint cadenassé' end
  from events e
  where e.tree_id = p_tree_id and event_locked(e.id);

  return query
  select 'media'::text, m.id, exists (select 1 from record_locks r
                                      where r.target_kind = 'media' and r.target_id = m.id),
         case when exists (select 1 from record_locks r
                           where r.target_kind = 'media' and r.target_id = m.id) then null::text
              else 'lié à une fiche ou un événement cadenassé' end
  from media m
  where m.tree_id = p_tree_id and media_locked(m.id);
end;
$$;
grant execute on function effective_locks(uuid) to authenticated;

-- ---------------------------------------------------------------------
-- 10. NOTIFICATIONS : nouveaux types
-- ---------------------------------------------------------------------
alter table notifications drop constraint if exists notifications_kind_check;
alter table notifications add constraint notifications_kind_check
  check (kind in ('new_act','new_photo','birthday','ownership_transfer'));

-- ---------------------------------------------------------------------
-- 11. JOURNAL : création de fiches et d'événements
-- Déjà couvert par record_history (insert/update/delete) ; rien à faire
-- côté base. L'affichage filtré se fait dans l'interface.
-- ---------------------------------------------------------------------
