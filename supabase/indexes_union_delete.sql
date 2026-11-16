-- Index manquants sur les colonnes parcourues lors de la suppression d'une union
-- (événements de l'union, citations, médias, filiations mises à NULL, partenaires).
-- Sans eux, la suppression fait des parcours complets et dépasse le délai de la base.
create index if not exists idx_citations_event on citations(event_id);
create index if not exists idx_citations_source on citations(source_id);
create index if not exists idx_media_source on media(source_id);
create index if not exists idx_filiations_union on filiations(union_id);
create index if not exists idx_union_partners_individual on union_partners(individual_id);
