-- ---------------------------------------------------------------------
-- CARTE INTERACTIVE — géocodage et résolution des toponymes historiques
-- À exécuter une fois, en plus de schema.sql / policies.sql / realtime.sql
-- / storage.sql.
-- ---------------------------------------------------------------------

-- Suivi de l'état de géocodage d'un lieu : un événement sans lieu résolu
-- ne peut pas apparaître sur la carte. 'pending' = jamais tenté,
-- 'ok' = coordonnées fiables, 'failed' = le géocodeur n'a rien trouvé
-- (à résoudre manuellement), 'manual' = coordonnées saisies à la main.
alter table places add column if not exists geocode_status text not null default 'pending'
  check (geocode_status in ('pending', 'ok', 'failed', 'manual'));

-- Table de correspondance pour les toponymes historiques (1500-2026) :
-- lieux-dits disparus, communes fusionnées, villes ayant changé de nom
-- ou de nationalité. Consultée par le géocodeur AVANT tout appel au
-- service externe (Nominatim) : un même raw_label de lieu peut désigner
-- des coordonnées différentes selon l'époque (ex: une ville annexée,
-- renommée, ou un hameau absorbé par une commune voisine).
create table historical_place_aliases (
  id              uuid primary key default gen_random_uuid(),
  tree_id         uuid not null references trees(id) on delete cascade,
  pattern         text not null,              -- sous-chaîne (normalisée, insensible à la casse/accents) recherchée dans le libellé brut
  year_start      int,                         -- période de validité de cette correspondance (bornes incluses, nulles = illimité)
  year_end        int,
  canonical_label text not null,               -- libellé moderne correspondant, pour affichage/traçabilité
  latitude        double precision not null,
  longitude       double precision not null,
  country         text,
  region          text,
  notes           text,                        -- ex: "Rattachée à la commune de ... en 1964"
  created_at      timestamptz not null default now()
);
create index idx_historical_aliases_tree on historical_place_aliases(tree_id);

alter table historical_place_aliases enable row level security;
create policy "historical_place_aliases: lecture membres" on historical_place_aliases
  for select using (is_tree_member(tree_id));
create policy "historical_place_aliases: écriture admin/famille" on historical_place_aliases
  for all using (is_tree_family_or_admin(tree_id));
