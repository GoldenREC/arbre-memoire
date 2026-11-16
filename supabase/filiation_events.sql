-- Liens parentaux datés : adoption, mise en famille d'accueil, reconnaissance
-- tardive, enfant non déclaré / abandonné. La date et le lieu vivent sur un
-- événement rattaché à l'enfant (preuve : acte ou informations familiales).
-- À exécuter une fois dans l'éditeur SQL Supabase (ajout de valeurs d'enum).
alter type event_type_enum add value if not exists 'adoption';
alter type event_type_enum add value if not exists 'foster_placement';
alter type event_type_enum add value if not exists 'recognition';
alter type event_type_enum add value if not exists 'abandonment';
alter type filiation_type add value if not exists 'abandoned';
