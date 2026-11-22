-- Migration: stop anyone from listing the avatars bucket.
-- Run in the Supabase SQL Editor (safe to run more than once).
-- The avatars bucket stays public, so a profile picture still opens from its address for everyone. What goes away is the
-- "Anyone can view avatars" rule, which also let anybody list every file name (they contain user ids) with the public key.
-- People keep reading their own folder (needed when a new picture replaces an old one).

drop policy if exists "Anyone can view avatars" on storage.objects;
drop policy if exists "Own avatar read" on storage.objects;
create policy "Own avatar read" on storage.objects for select to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);

notify pgrst, 'reload schema';
