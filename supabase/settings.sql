-- =====================================================================
-- PARAMÈTRES — membres & invitations, préférences par membre,
-- notifications, confidentialité RGPD configurable, historique des
-- modifications ("qui a changé quoi, et quand" sur chaque fiche).
-- À exécuter une fois, en plus de schema.sql / policies.sql /
-- realtime.sql / storage.sql / map.sql.
-- =====================================================================

-- ---------------------------------------------------------------------
-- CONFIDENTIALITÉ RGPD CONFIGURABLE
-- Remplace le seuil fixe de 100 ans (v_individuals_with_privacy,
-- lib/utils/privacy.js) par un réglage par arbre, modifiable par un
-- admin depuis Paramètres.
-- ---------------------------------------------------------------------
alter table trees add column if not exists privacy_threshold_years integer not null default 100
  check (privacy_threshold_years > 0);

-- La policy d'origine ("trees: owner peut tout faire") ne couvre que le
-- propriétaire historique de l'arbre (owner_id) ; un Admin invité par la
-- suite (rôle app_role = 'admin' dans tree_members, sans être owner_id)
-- doit pouvoir lui aussi ajuster le seuil RGPD et les autres réglages
-- depuis Paramètres.
create policy "trees: réglages modifiables par les admins" on trees
  for update using (is_tree_admin(id)) with check (is_tree_admin(id));

create or replace view v_individuals_with_privacy as
select
  i.*,
  (i.death_date is null and i.birth_date is not null
     and i.birth_date > (current_date - make_interval(years => t.privacy_threshold_years))
  ) as is_privacy_protected
from individuals i
join trees t on t.id = i.tree_id;

-- ---------------------------------------------------------------------
-- PRÉFÉRENCES PAR MEMBRE
-- Langues, format de date, affichage des cases de l'arbre, canaux de
-- notification, et fiche-racine par défaut à l'ouverture de l'arbre
-- ("De Cujus" personnel de chaque membre).
-- NB : l'énum app_role ('admin' | 'family' | 'guest') n'est pas
-- renommée, pour ne casser aucune politique RLS existante — l'interface
-- affiche simplement ces rôles sous les libellés Admin / Contributeur /
-- Lecteur.
-- ---------------------------------------------------------------------
alter table tree_members add column if not exists default_root_individual_id uuid references individuals(id) on delete set null;
alter table tree_members add column if not exists ui_language text not null default 'fr'
  check (ui_language in ('fr','en','it','es','de','pt'));
alter table tree_members add column if not exists email_language text not null default 'fr'
  check (email_language in ('fr','en','it','es','de','pt'));
alter table tree_members add column if not exists date_format text not null default 'dmy'
  check (date_format in ('dmy','ymd'));
alter table tree_members add column if not exists show_nicknames boolean not null default true;
alter table tree_members add column if not exists show_professions boolean not null default true;
alter table tree_members add column if not exists notify_new_act boolean not null default true;
alter table tree_members add column if not exists notify_new_photo boolean not null default true;
alter table tree_members add column if not exists notify_birthdays boolean not null default true;
alter table tree_members add column if not exists notify_email boolean not null default true;
alter table tree_members add column if not exists notify_inapp boolean not null default true;

-- Un membre modifie ses propres préférences (mais pas son rôle : déjà
-- couvert par la policy "members: modifiables par les admins").
create policy "members: préférences modifiables par soi-même" on tree_members
  for update using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- ---------------------------------------------------------------------
-- PROFILS (miroir minimal d'auth.users, illisible directement par
-- l'API publique) : juste de quoi afficher l'e-mail d'un membre dans le
-- tableau de gestion, sans donner accès à toute la table auth.users.
-- ---------------------------------------------------------------------
create table profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  email       text,
  created_at  timestamptz not null default now()
);
alter table profiles enable row level security;
create policy "profiles: lisible par les membres des mêmes arbres" on profiles
  for select using (
    id = auth.uid()
    or exists (
      select 1 from tree_members me
      join tree_members them on them.tree_id = me.tree_id
      where me.user_id = auth.uid() and them.user_id = profiles.id
    )
  );

create or replace function handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into profiles (id, email) values (new.id, new.email)
  on conflict (id) do update set email = excluded.email;
  return new;
end;
$$;

drop trigger if exists trg_handle_new_user on auth.users;
create trigger trg_handle_new_user after insert or update of email on auth.users
  for each row execute function handle_new_user();

-- Les comptes déjà créés avant cette migration n'ont pas encore de
-- ligne profiles : on les rattrape une fois ici.
insert into profiles (id, email)
select id, email from auth.users
on conflict (id) do update set email = excluded.email;

-- ---------------------------------------------------------------------
-- INVITATIONS PAR E-MAIL
-- ---------------------------------------------------------------------
create table tree_invitations (
  id            uuid primary key default gen_random_uuid(),
  tree_id       uuid not null references trees(id) on delete cascade,
  email         text not null,
  role          app_role not null default 'guest',
  token         uuid not null default gen_random_uuid(),
  invited_by    uuid references auth.users(id),
  status        text not null default 'pending' check (status in ('pending','accepted','revoked','expired')),
  created_at    timestamptz not null default now(),
  expires_at    timestamptz not null default (now() + interval '14 days'),
  accepted_at   timestamptz
);
create unique index idx_tree_invitations_token on tree_invitations(token);
create index idx_tree_invitations_tree on tree_invitations(tree_id, status);

alter table tree_invitations enable row level security;
create policy "invitations: lecture admin" on tree_invitations for select using (is_tree_admin(tree_id));
create policy "invitations: création admin" on tree_invitations for insert with check (is_tree_admin(tree_id));
create policy "invitations: modification admin" on tree_invitations for update using (is_tree_admin(tree_id));
create policy "invitations: suppression admin" on tree_invitations for delete using (is_tree_admin(tree_id));

-- Aperçu public d'une invitation (nom de l'arbre, rôle proposé) sans
-- exposer toute la table à un visiteur non authentifié — nécessaire
-- pour afficher "Tu es invité à rejoindre l'arbre de ... en tant que
-- ..." avant même la connexion, sur la page /invite/:token.
create or replace function get_invitation_preview(p_token uuid)
returns table (tree_name text, role app_role, email text, status text, expired boolean)
language sql security definer stable as $$
  select t.name, i.role, i.email, i.status, (i.expires_at < now()) as expired
  from tree_invitations i
  join trees t on t.id = i.tree_id
  where i.token = p_token
  limit 1;
$$;
grant execute on function get_invitation_preview(uuid) to anon, authenticated;

-- Acceptation d'une invitation : vérifie que l'e-mail du compte
-- connecté correspond à celui invité, puis crée (ou met à jour)
-- l'adhésion. SECURITY DEFINER : au moment de l'appel, l'utilisateur
-- n'est pas encore membre de l'arbre, donc la policy normale de
-- tree_members (réservée aux admins) l'empêcherait de s'ajouter
-- lui-même — cette fonction est l'unique point de passage contrôlé.
create or replace function accept_invitation(p_token uuid)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_invitation tree_invitations%rowtype;
  v_user_email text;
begin
  select * into v_invitation from tree_invitations where token = p_token for update;
  if not found then
    raise exception 'Invitation introuvable.';
  end if;
  if v_invitation.status <> 'pending' then
    raise exception 'Cette invitation a déjà été utilisée ou révoquée.';
  end if;
  if v_invitation.expires_at < now() then
    update tree_invitations set status = 'expired' where id = v_invitation.id;
    raise exception 'Cette invitation a expiré.';
  end if;

  select email into v_user_email from auth.users where id = auth.uid();
  if v_user_email is null or lower(v_user_email) <> lower(v_invitation.email) then
    raise exception 'Cette invitation a été envoyée à une autre adresse e-mail.';
  end if;

  insert into tree_members (tree_id, user_id, role)
  values (v_invitation.tree_id, auth.uid(), v_invitation.role)
  on conflict (tree_id, user_id) do update set role = excluded.role;

  update tree_invitations set status = 'accepted', accepted_at = now() where id = v_invitation.id;

  return v_invitation.tree_id;
end;
$$;
grant execute on function accept_invitation(uuid) to authenticated;

-- ---------------------------------------------------------------------
-- BRANCHES SUIVIES (pour la notification "nouveau portrait")
-- ---------------------------------------------------------------------
create table followed_individuals (
  tree_id       uuid not null references trees(id) on delete cascade,
  user_id       uuid not null references auth.users(id) on delete cascade,
  individual_id uuid not null references individuals(id) on delete cascade,
  created_at    timestamptz not null default now(),
  primary key (tree_id, user_id, individual_id)
);
alter table followed_individuals enable row level security;
create policy "followed: lecture par son propriétaire" on followed_individuals
  for select using (user_id = auth.uid());
create policy "followed: gestion par son propriétaire" on followed_individuals
  for all using (user_id = auth.uid()) with check (user_id = auth.uid() and is_tree_member(tree_id));

-- Tous les ancêtres d'un individu (remontée récursive des filiations),
-- utilisé pour savoir si une personne appartient à une branche suivie
-- (= elle-même ou un de ses descendants est suivi). Profondeur bornée
-- par prudence (généalogie corrompue avec un cycle de filiation).
create or replace function individual_ancestors(p_individual_id uuid)
returns table(ancestor_id uuid)
language sql stable as $$
  with recursive up(ancestor_id, depth) as (
    select parent_id, 1 from filiations where child_id = p_individual_id
    union
    select f.parent_id, up.depth + 1
    from filiations f join up on f.child_id = up.ancestor_id
    where up.depth < 50
  )
  select distinct ancestor_id from up;
$$;

-- ---------------------------------------------------------------------
-- NOTIFICATIONS (in-app ; l'envoi par e-mail est géré côté application,
-- voir ARCHITECTURE.md — ces lignes alimentent la cloche de l'interface
-- et servent de base à un éventuel envoi d'e-mail différé)
-- ---------------------------------------------------------------------
create table notifications (
  id            uuid primary key default gen_random_uuid(),
  tree_id       uuid not null references trees(id) on delete cascade,
  user_id       uuid not null references auth.users(id) on delete cascade,
  kind          text not null check (kind in ('new_act','new_photo','birthday')),
  title         text not null,
  body          text,
  individual_id uuid references individuals(id) on delete cascade,
  link          text,
  read_at       timestamptz,
  created_at    timestamptz not null default now()
);
create index idx_notifications_user on notifications(user_id, created_at desc);
alter table notifications enable row level security;
create policy "notifications: lecture par son destinataire" on notifications for select using (user_id = auth.uid());
create policy "notifications: marquage lu par son destinataire" on notifications for update using (user_id = auth.uid());
create policy "notifications: suppression par son destinataire" on notifications for delete using (user_id = auth.uid());
-- Aucune policy d'insertion pour les utilisateurs : seules les
-- fonctions SECURITY DEFINER ci-dessous créent des notifications.

alter publication supabase_realtime add table notifications;

create or replace function notify_new_act()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  begin
    if new.source_id is null or new.media_type <> 'document' then
      return new;
    end if;
    insert into notifications (tree_id, user_id, kind, title, body, link)
    select new.tree_id, tm.user_id, 'new_act', 'Nouvel acte ajouté',
           coalesce(new.title, 'Un acte a été rattaché à une source.'), '/sources'
    from tree_members tm
    where tm.tree_id = new.tree_id
      and tm.notify_new_act = true and tm.notify_inapp = true
      and tm.user_id is distinct from new.uploaded_by;
  exception when others then
    raise notice 'notify_new_act: %', sqlerrm;
  end;
  return new;
end;
$$;
create trigger trg_notify_new_act after insert on media for each row execute function notify_new_act();

create or replace function notify_new_photo()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_tree_id uuid;
  v_media_type media_type_enum;
  v_watched_ids uuid[];
begin
  begin
    if new.subject_kind <> 'individual' then
      return new;
    end if;
    select tree_id, media_type into v_tree_id, v_media_type from media where id = new.media_id;
    if v_media_type is distinct from 'photo' then
      return new;
    end if;

    select array_agg(distinct x) into v_watched_ids
    from (select new.subject_id as x union select ancestor_id from individual_ancestors(new.subject_id)) s;

    insert into notifications (tree_id, user_id, kind, title, body, individual_id, link)
    select distinct v_tree_id, f.user_id, 'new_photo', 'Nouveau portrait sur une branche suivie',
           'Une nouvelle photo a été ajoutée.', new.subject_id, '/individus/' || new.subject_id
    from followed_individuals f
    join tree_members tm on tm.tree_id = f.tree_id and tm.user_id = f.user_id
    where f.tree_id = v_tree_id and f.individual_id = any(v_watched_ids)
      and tm.notify_new_photo = true and tm.notify_inapp = true;
  exception when others then
    raise notice 'notify_new_photo: %', sqlerrm;
  end;
  return new;
end;
$$;
create trigger trg_notify_new_photo after insert on media_links for each row execute function notify_new_photo();

-- Anniversaires du jour : à appeler une fois par jour (pg_cron si
-- l'extension est activée sur le projet Supabase, ou une Edge Function
-- programmée qui exécute `select check_birthday_notifications();`).
-- Idempotente : ne recrée pas de notification déjà envoyée aujourd'hui
-- pour la même personne et le même destinataire.
create or replace function check_birthday_notifications()
returns void language plpgsql security definer set search_path = public as $$
begin
  insert into notifications (tree_id, user_id, kind, title, body, individual_id, link)
  select i.tree_id, tm.user_id, 'birthday', 'Anniversaire du jour',
         trim(coalesce(i.first_names,'') || ' ' || coalesce(i.last_name,'')) ||
           case when i.is_deceased then ' — anniversaire de naissance' else ' fête son anniversaire aujourd''hui' end,
         i.id, '/individus/' || i.id
  from individuals i
  join tree_members tm on tm.tree_id = i.tree_id
  where i.birth_date is not null
    and extract(month from i.birth_date) = extract(month from current_date)
    and extract(day from i.birth_date) = extract(day from current_date)
    and tm.notify_birthdays = true and tm.notify_inapp = true
    and not exists (
      select 1 from notifications n
      where n.individual_id = i.id and n.user_id = tm.user_id and n.kind = 'birthday'
        and n.created_at::date = current_date
    );
end;
$$;
grant execute on function check_birthday_notifications() to authenticated;

-- ---------------------------------------------------------------------
-- HISTORIQUE DES MODIFICATIONS
-- Qui a changé quoi, et quand, sur chaque fiche (individu, union,
-- filiation, événement, citation) — admins compris, personne n'est
-- exempté du suivi. Alimenté uniquement par le déclencheur ci-dessous ;
-- jamais par une écriture directe depuis l'application.
-- ---------------------------------------------------------------------
create table record_history (
  id            uuid primary key default gen_random_uuid(),
  tree_id       uuid not null references trees(id) on delete cascade,
  table_name    text not null,
  record_id     uuid not null,
  operation     text not null check (operation in ('insert','update','delete')),
  changed_by    uuid references auth.users(id),
  changed_at    timestamptz not null default now(),
  changes       jsonb
);
create index idx_record_history_record on record_history(table_name, record_id, changed_at desc);
create index idx_record_history_tree on record_history(tree_id, changed_at desc);

alter table record_history enable row level security;
create policy "record_history: lecture membres" on record_history for select using (is_tree_member(tree_id));
-- Aucune policy d'écriture pour les utilisateurs : seule la fonction
-- SECURITY DEFINER ci-dessous (appelée par les déclencheurs) alimente
-- cette table.

create or replace function log_record_history()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_tree_id uuid;
  v_changes jsonb := '{}'::jsonb;
  v_key text;
begin
  begin
    if TG_OP = 'DELETE' then
      v_tree_id := (to_jsonb(old)->>'tree_id')::uuid;
    else
      v_tree_id := (to_jsonb(new)->>'tree_id')::uuid;
    end if;

    if TG_OP = 'UPDATE' then
      for v_key in select jsonb_object_keys(to_jsonb(new)) loop
        if v_key = 'updated_at' then continue; end if;
        if (to_jsonb(old)->v_key) is distinct from (to_jsonb(new)->v_key) then
          v_changes := v_changes || jsonb_build_object(v_key, jsonb_build_object('from', to_jsonb(old)->v_key, 'to', to_jsonb(new)->v_key));
        end if;
      end loop;
      if v_changes = '{}'::jsonb then
        return new; -- rien d'effectif n'a changé (ex: ré-enregistrement identique)
      end if;
    elsif TG_OP = 'INSERT' then
      v_changes := to_jsonb(new);
    else
      v_changes := to_jsonb(old);
    end if;

    insert into record_history (tree_id, table_name, record_id, operation, changed_by, changes)
    values (
      v_tree_id, TG_TABLE_NAME,
      coalesce((to_jsonb(new)->>'id'), (to_jsonb(old)->>'id'))::uuid,
      lower(TG_OP), auth.uid(), v_changes
    );
  exception when others then
    -- L'historique ne doit jamais faire échouer l'écriture réelle.
    raise notice 'log_record_history: %', sqlerrm;
  end;

  return coalesce(new, old);
end;
$$;

create trigger trg_history_individuals after insert or update or delete on individuals for each row execute function log_record_history();
create trigger trg_history_unions      after insert or update or delete on unions      for each row execute function log_record_history();
create trigger trg_history_filiations  after insert or update or delete on filiations  for each row execute function log_record_history();
create trigger trg_history_events      after insert or update or delete on events      for each row execute function log_record_history();
create trigger trg_history_citations   after insert or update or delete on citations   for each row execute function log_record_history();
