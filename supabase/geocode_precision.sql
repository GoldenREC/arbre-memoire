-- =====================================================================
-- PRÉCISION DU GÉOCODAGE EN CASCADE — mémorise le niveau effectivement
-- atteint quand un lieu structuré (voir places_structured.sql) est
-- résolu via la cascade du plus précis (adresse complète) au plus
-- général (pays seul) : si le niveau le plus précis n'est pas reconnu
-- par Nominatim, le géocodeur retire automatiquement ce niveau et
-- retente avec le niveau juste au-dessus (lib/geo/geocoder.js,
-- buildGeocodeLevels). Sert à afficher sur la carte si un marqueur est
-- une position précise ou une approximation (département/région/pays).
--
-- Nullable et sans effet sur les lieux déjà géocodés : ils restent
-- affichés exactement comme avant, simplement sans badge de précision
-- tant qu'ils n'ont pas été regéocodés.
-- À exécuter une fois, en plus de schema.sql / policies.sql /
-- realtime.sql / storage.sql / map.sql / settings.sql / merge.sql /
-- source_types.sql / places_structured.sql.
-- =====================================================================

alter table places add column if not exists geocode_precision text
  check (geocode_precision in ('street', 'building', 'arrondissement', 'city', 'department', 'region', 'country', 'alias'));
