-- Plusieurs liens entre un même enfant et un même parent, un par type
-- (ex. adoption plénière puis adoption simple). Chaque lien daté porte
-- son événement (date, lieu, preuve) via filiations.event_id.
alter table filiations drop constraint if exists filiations_child_id_parent_id_key;
alter table filiations add constraint filiations_child_parent_type_key unique (child_id, parent_id, filiation_type);
alter table filiations add column if not exists event_id uuid references events(id) on delete set null;
