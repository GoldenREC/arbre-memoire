-- =====================================================================
-- SCHEMA PRINCIPAL — Application de généalogie
-- Cible : Postgres (Supabase). À exécuter dans l'éditeur SQL Supabase.
-- =====================================================================

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------
-- ENUMS
-- ---------------------------------------------------------------------
create type app_role        as enum ('admin', 'family', 'guest');
create type sex_type        as enum ('M', 'F', 'U');
create type filiation_type  as enum (
  'biological', 'adoption_plenary', 'adoption_simple',
  'foster', 'late_recognition', 'unknown'
);
create type union_type_enum as enum ('marriage', 'civil_union', 'cohabitation', 'unknown');
create type union_status    as enum ('ongoing', 'divorced', 'widowed', 'annulled', 'unknown');
create type event_type_enum as enum (
  'birth', 'death', 'marriage', 'divorce', 'engagement', 'baptism', 'burial',
  'residence', 'immigration', 'emigration', 'occupation', 'education',
  'military', 'religion', 'custom'
);
create type date_precision  as enum ('exact', 'about', 'before', 'after', 'between', 'unknown');
create type proof_level     as enum (
  'proven_original', 'proven_secondary', 'probable', 'hypothesis', 'disproved'
);
create type media_type_enum as enum ('photo', 'document', 'audio', 'video');
create type subject_kind    as enum ('individual', 'union', 'event', 'pet');

-- ---------------------------------------------------------------------
-- ARBRES (un compte peut gérer plusieurs arbres)
-- ---------------------------------------------------------------------
create table trees (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  owner_id    uuid not null references auth.users(id) on delete cascade,
  created_at  timestamptz not null default now()
);

-- Table des membres d'un arbre (remplace un simple "rôle global")
create table tree_members (
  tree_id     uuid not null references trees(id) on delete cascade,
  user_id     uuid not null references auth.users(id) on delete cascade,
  role        app_role not null default 'guest',
  invited_at  timestamptz not null default now(),
  primary key (tree_id, user_id)
);

-- ---------------------------------------------------------------------
-- LIEUX (géocodés pour la carte interactive)
-- ---------------------------------------------------------------------
create table places (
  id            uuid primary key default gen_random_uuid(),
  tree_id       uuid not null references trees(id) on delete cascade,
  raw_label     text not null,              -- ex: "Grasse, Alpes-Maritimes, France"
  normalized    text,                        -- libellé nettoyé pour la déduplication
  latitude      double precision,
  longitude     double precision,
  country       text,
  region        text,
  geocoded_at   timestamptz,
  created_at    timestamptz not null default now()
);
create index idx_places_tree on places(tree_id);
create index idx_places_normalized on places(tree_id, normalized);

-- ---------------------------------------------------------------------
-- INDIVIDUS
-- ---------------------------------------------------------------------
create table individuals (
  id              uuid primary key default gen_random_uuid(),
  tree_id         uuid not null references trees(id) on delete cascade,
  first_names     text,
  last_name       text,
  birth_name      text,                     -- nom de naissance si différent (ex: femme mariée)
  nickname        text,
  sex             sex_type not null default 'U',

  birth_date      date,
  birth_date_precision date_precision default 'unknown',
  birth_place_id  uuid references places(id),

  death_date      date,
  death_date_precision date_precision default 'unknown',
  death_place_id  uuid references places(id),
  is_deceased     boolean not null default false,

  occupation      text,
  biography       text,                     -- notes biographiques libres

  gedcom_xref      text,                     -- @I123@ d'origine, pour traçabilité d'import
  import_batch_id  uuid,                     -- rempli après création de import_batches (FK ajoutée plus bas)

  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index idx_individuals_tree on individuals(tree_id);
create index idx_individuals_name on individuals(tree_id, last_name, first_names);
create index idx_individuals_birth on individuals(tree_id, birth_date);

-- ---------------------------------------------------------------------
-- UNIONS (couples : mariages, PACS, concubinages...)
-- ---------------------------------------------------------------------
create table unions (
  id            uuid primary key default gen_random_uuid(),
  tree_id       uuid not null references trees(id) on delete cascade,
  union_type    union_type_enum not null default 'unknown',
  status        union_status not null default 'unknown',
  start_date    date,
  start_date_precision date_precision default 'unknown',
  end_date      date,                        -- divorce / décès du conjoint
  end_date_precision date_precision default 'unknown',
  place_id      uuid references places(id),
  notes         text,
  gedcom_xref   text,
  created_at    timestamptz not null default now()
);
create index idx_unions_tree on unions(tree_id);

-- Partenaires d'une union (2 le plus souvent, structure flexible non binaire HUSB/WIFE)
create table union_partners (
  union_id      uuid not null references unions(id) on delete cascade,
  individual_id uuid not null references individuals(id) on delete cascade,
  role_label    text,                        -- libre : "époux", "épouse", "partenaire"...
  primary key (union_id, individual_id)
);

-- ---------------------------------------------------------------------
-- FILIATIONS (lien enfant → parent, typé)
-- Un enfant peut avoir 2 parents biologiques, ou 1 bio + 1 adoptif, etc.
-- Permet aussi les demi-frères/soeurs et familles d'accueil.
-- ---------------------------------------------------------------------
create table filiations (
  id              uuid primary key default gen_random_uuid(),
  tree_id         uuid not null references trees(id) on delete cascade,
  child_id        uuid not null references individuals(id) on delete cascade,
  parent_id       uuid not null references individuals(id) on delete cascade,
  union_id        uuid references unions(id) on delete set null, -- couple parental, si connu
  filiation_type  filiation_type not null default 'biological',
  notes           text,
  created_at      timestamptz not null default now(),
  unique (child_id, parent_id)
);
create index idx_filiations_child on filiations(child_id);
create index idx_filiations_parent on filiations(parent_id);

-- ---------------------------------------------------------------------
-- ÉVÉNEMENTS (polymorphe : rattaché à un individu OU une union)
-- ---------------------------------------------------------------------
create table events (
  id              uuid primary key default gen_random_uuid(),
  tree_id         uuid not null references trees(id) on delete cascade,
  subject_kind    subject_kind not null,      -- 'individual' | 'union'
  subject_id      uuid not null,              -- FK logique vers individuals.id ou unions.id
  event_type      event_type_enum not null,
  label           text,                        -- libellé libre si 'custom'
  event_date      date,
  date_precision  date_precision default 'unknown',
  place_id        uuid references places(id),
  description     text,
  proof_level     proof_level default 'hypothesis',
  created_at      timestamptz not null default now()
);
create index idx_events_tree on events(tree_id);
create index idx_events_subject on events(subject_kind, subject_id);
create index idx_events_date on events(tree_id, event_date);

-- ---------------------------------------------------------------------
-- SOURCES & CITATIONS (preuves)
-- ---------------------------------------------------------------------
create table sources (
  id            uuid primary key default gen_random_uuid(),
  tree_id       uuid not null references trees(id) on delete cascade,
  title         text not null,               -- ex: "Registre paroissial de Grasse 1812"
  repository    text,                         -- ex: "Archives départementales 06"
  call_number   text,                         -- cote
  url           text,
  notes         text,
  created_at    timestamptz not null default now()
);

create table citations (
  id            uuid primary key default gen_random_uuid(),
  tree_id       uuid not null references trees(id) on delete cascade,
  source_id     uuid not null references sources(id) on delete cascade,
  event_id      uuid references events(id) on delete cascade,
  individual_id uuid references individuals(id) on delete cascade,
  transcription text,                         -- transcription de l'acte
  page_ref      text,
  created_at    timestamptz not null default now(),
  check (event_id is not null or individual_id is not null)
);

-- ---------------------------------------------------------------------
-- MÉDIAS (photos, actes scannés...) — fichiers réels dans Supabase Storage
-- ---------------------------------------------------------------------
create table media (
  id            uuid primary key default gen_random_uuid(),
  tree_id       uuid not null references trees(id) on delete cascade,
  media_type    media_type_enum not null default 'photo',
  storage_path  text not null,                -- chemin dans le bucket Supabase Storage
  title         text,
  description   text,
  taken_at      date,
  source_id     uuid references sources(id),  -- si le média EST un acte source
  uploaded_by   uuid references auth.users(id),
  created_at    timestamptz not null default now()
);

-- Rattachement générique d'un média à une entité (individu, union, événement, animal)
create table media_links (
  media_id      uuid not null references media(id) on delete cascade,
  subject_kind  subject_kind not null,
  subject_id    uuid not null,
  primary key (media_id, subject_kind, subject_id)
);

-- Tags de visages sur une photo de groupe (coordonnées en fractions 0..1 de la largeur/hauteur)
create table media_face_tags (
  id            uuid primary key default gen_random_uuid(),
  media_id      uuid not null references media(id) on delete cascade,
  individual_id uuid not null references individuals(id) on delete cascade,
  x             numeric not null,
  y             numeric not null,
  width         numeric not null,
  height        numeric not null,
  created_at    timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- ANIMAUX DE COMPAGNIE
-- ---------------------------------------------------------------------
create table pets (
  id            uuid primary key default gen_random_uuid(),
  tree_id       uuid not null references trees(id) on delete cascade,
  name          text not null,
  species       text,                         -- chien, chat, cheval...
  breed         text,
  sex           sex_type default 'U',
  birth_date    date,
  death_date    date,
  anecdotes     text,
  created_at    timestamptz not null default now()
);

create table pet_links (
  pet_id        uuid not null references pets(id) on delete cascade,
  subject_kind  subject_kind not null,        -- 'individual' | 'union'
  subject_id    uuid not null,
  relationship  text,                          -- "animal de compagnie de..."
  primary key (pet_id, subject_kind, subject_id)
);

-- ---------------------------------------------------------------------
-- IMPORTS GEDCOM (traçabilité)
-- ---------------------------------------------------------------------
create table import_batches (
  id                   uuid primary key default gen_random_uuid(),
  tree_id              uuid not null references trees(id) on delete cascade,
  filename             text,
  imported_by          uuid references auth.users(id),
  imported_at          timestamptz not null default now(),
  raw_individual_count int default 0,
  raw_family_count     int default 0,
  status               text default 'completed' -- 'completed' | 'reviewing' | 'failed'
);

alter table individuals
  add constraint fk_individuals_import_batch
  foreign key (import_batch_id) references import_batches(id) on delete set null;

-- ---------------------------------------------------------------------
-- AUDIT — incohérences détectées (cache ; peut aussi être recalculé à la volée)
-- ---------------------------------------------------------------------
create table audit_findings (
  id            uuid primary key default gen_random_uuid(),
  tree_id       uuid not null references trees(id) on delete cascade,
  finding_type  text not null,                -- 'child_before_parent', 'death_before_birth', ...
  severity      text not null default 'warning', -- 'info' | 'warning' | 'error'
  subject_kind  subject_kind not null,
  subject_id    uuid not null,
  description   text not null,
  detected_at   timestamptz not null default now(),
  resolved      boolean not null default false
);

-- ---------------------------------------------------------------------
-- VUE : individus "vivants" au sens de la règle de confidentialité RGPD
-- (né il y a < 100 ans ET sans date de décès connue)
-- ---------------------------------------------------------------------
create or replace view v_individuals_with_privacy as
select
  i.*,
  (i.death_date is null and i.birth_date is not null
     and i.birth_date > (current_date - interval '100 years')
  ) as is_privacy_protected
from individuals i;
