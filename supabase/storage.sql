-- =====================================================================
-- STORAGE — bucket "media" pour les actes scannés (et, plus tard, les
-- photos). À exécuter une fois, après schema.sql / policies.sql.
--
-- Convention de chemin : "<tree_id>/<media_id>-<nom de fichier>" — la
-- politique ci-dessous extrait le premier segment du chemin et vérifie
-- l'appartenance à l'arbre, exactement comme pour les autres tables.
-- Bucket privé : les fichiers sont servis via des URL signées à durée
-- limitée (voir src/lib/db/mediaStorage.js), jamais en accès public —
-- les actes contiennent des données personnelles.
-- =====================================================================

insert into storage.buckets (id, name, public)
values ('media', 'media', false)
on conflict (id) do nothing;

create policy "media storage: lecture membres" on storage.objects
  for select using (
    bucket_id = 'media' and is_tree_member((storage.foldername(name))[1]::uuid)
  );

create policy "media storage: écriture admin/famille" on storage.objects
  for insert with check (
    bucket_id = 'media' and is_tree_family_or_admin((storage.foldername(name))[1]::uuid)
  );

create policy "media storage: mise à jour admin/famille" on storage.objects
  for update using (
    bucket_id = 'media' and is_tree_family_or_admin((storage.foldername(name))[1]::uuid)
  );

create policy "media storage: suppression admin/famille" on storage.objects
  for delete using (
    bucket_id = 'media' and is_tree_family_or_admin((storage.foldername(name))[1]::uuid)
  );
