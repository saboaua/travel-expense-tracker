-- Storage access rules for receipts and avatars. Run in the Supabase SQL Editor (safe to run more than once).
--
-- The receipts rules were only ever written as comments in schema.sql, so they may never have been created.
-- Files are stored under the owner's id ("<user id>/..."). These rules let a signed-in person read, add, replace
-- and delete files ONLY inside their own folder. The server (service role) is not affected: Telegram uploads and
-- the trip zip export keep working.
--
-- (Documents, loyalty images and branding have their own rules in their migrations.)

-- receipts: private. The app only ever uses signed links, so making sure it is not public changes nothing for you.
insert into storage.buckets (id, name, public) values ('receipts', 'receipts', false)
on conflict (id) do update set public = false;

drop policy if exists "Own receipts read" on storage.objects;
create policy "Own receipts read" on storage.objects for select to authenticated
  using (bucket_id = 'receipts' and (storage.foldername(name))[1] = (select auth.uid())::text);

drop policy if exists "Own receipts insert" on storage.objects;
create policy "Own receipts insert" on storage.objects for insert to authenticated
  with check (bucket_id = 'receipts' and (storage.foldername(name))[1] = (select auth.uid())::text);

drop policy if exists "Own receipts update" on storage.objects;
create policy "Own receipts update" on storage.objects for update to authenticated
  using (bucket_id = 'receipts' and (storage.foldername(name))[1] = (select auth.uid())::text)
  with check (bucket_id = 'receipts' and (storage.foldername(name))[1] = (select auth.uid())::text);

drop policy if exists "Own receipts delete" on storage.objects;
create policy "Own receipts delete" on storage.objects for delete to authenticated
  using (bucket_id = 'receipts' and (storage.foldername(name))[1] = (select auth.uid())::text);

-- avatars: the bucket is public to read (profile pictures are shown by address); only the owner can write to their folder.
drop policy if exists "Own avatar insert" on storage.objects;
create policy "Own avatar insert" on storage.objects for insert to authenticated
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);

drop policy if exists "Own avatar update" on storage.objects;
create policy "Own avatar update" on storage.objects for update to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text)
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);

drop policy if exists "Own avatar delete" on storage.objects;
create policy "Own avatar delete" on storage.objects for delete to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);

-- Check afterwards: every storage rule and which bucket it covers
-- select policyname, cmd from pg_policies where schemaname = 'storage' and tablename = 'objects' order by policyname;
