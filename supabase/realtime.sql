-- =====================================================================
-- REALTIME — à exécuter une fois, après schema.sql et policies.sql.
-- Active la réplication Supabase Realtime sur les tables consultées par
-- la fiche individu (src/features/individual/useIndividualDetail.js),
-- pour que la fiche se mette à jour instantanément si un autre membre
-- de la famille modifie la même personne en même temps.
-- =====================================================================

alter publication supabase_realtime add table individuals;
alter publication supabase_realtime add table events;
alter publication supabase_realtime add table filiations;
alter publication supabase_realtime add table unions;
alter publication supabase_realtime add table union_partners;
alter publication supabase_realtime add table citations;
