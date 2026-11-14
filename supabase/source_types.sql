-- =====================================================================
-- TYPES DE SOURCE FIABLES — restreint le type d'une source à trois
-- catégories (permalien d'archive, acte, donnée familiale). Les sites
-- d'arbres collaboratifs (Geneanet, MyHeritage, Ancestry...) ne sont
-- volontairement PAS une catégorie proposée : ce sont des compilations
-- faites par d'autres utilisateurs, pas des preuves primaires. Voir
-- src/lib/utils/sourceReliability.js pour la détection, côté
-- application, des sources déjà pointées vers ces sites.
-- À exécuter une fois, en plus de schema.sql / policies.sql /
-- realtime.sql / storage.sql / map.sql / settings.sql / merge.sql.
--
-- Nullable volontairement : les sources déjà existantes (y compris
-- celles importées depuis un GEDCOM, qui peuvent justement pointer
-- vers ce genre de site) ne sont pas reclassées automatiquement — le
-- gestionnaire de sources invite à choisir un type à chaque création
-- ou modification, sans effacer ni bloquer les sources déjà en place.
-- =====================================================================
create type source_type as enum ('archive_permalink', 'civil_record', 'family_data');

alter table sources add column if not exists source_type source_type;
