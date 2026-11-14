-- =====================================================================
-- LIEUX STRUCTURÉS — découpe un lieu en champs distincts (numéro, rue,
-- bâtiment/lieu-dit, arrondissement, commune, code postal, département)
-- en plus de country/region qui existent déjà sur `places`. Alimentés
-- par le nouveau composant StructuredPlaceInput (saisie d'une fiche
-- individu) via l'autocomplétion API Adresse (api-adresse.data.gouv.fr).
--
-- Tous nullables et sans aucun effet sur les lieux existants : un lieu
-- importé d'un GEDCOM ou créé via l'ancien champ libre ne garde que
-- raw_label/normalized, exactement comme avant. raw_label reste la
-- référence pour la dédoublonnage (normalized) et l'affichage par
-- défaut ; les champs structurés s'ajoutent, ils ne la remplacent pas.
-- À exécuter une fois, en plus de schema.sql / policies.sql /
-- realtime.sql / storage.sql / map.sql / settings.sql / merge.sql /
-- source_types.sql.
-- =====================================================================

alter table places add column if not exists street_number  text; -- numéro de rue (texte : "12 bis", "14B"...)
alter table places add column if not exists street_name    text; -- nom de la rue
alter table places add column if not exists building_name  text; -- bâtiment / lieu-dit
alter table places add column if not exists arrondissement text; -- ex: "6e arrondissement" (Paris/Lyon/Marseille)
alter table places add column if not exists city           text; -- commune / ville
alter table places add column if not exists postal_code    text; -- texte : peut commencer par un zéro ("06800")
alter table places add column if not exists department     text; -- département (France) ou état (autres pays)
