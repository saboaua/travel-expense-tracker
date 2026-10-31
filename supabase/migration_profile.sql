-- Run this in Supabase SQL Editor to add profile fields

-- Add new columns to profiles
alter table public.profiles
  add column if not exists first_name text,
  add column if not exists last_name text,
  add column if not exists title text,
  add column if not exists avatar_url text;

-- Optional: backfill first/last name from full_name if present
update public.profiles
set
  first_name = split_part(full_name, ' ', 1),
  last_name = nullif(trim(substring(full_name from position(' ' in full_name))), '')
where full_name is not null
  and first_name is null;

-- Storage bucket for avatars (create in dashboard if not exists)
-- insert into storage.buckets (id, name, public) values ('avatars', 'avatars', true);

-- Avatar storage policies (run after creating the 'avatars' bucket)
-- create policy "Users can upload own avatar"
-- on storage.objects for insert
-- to authenticated
-- with check (bucket_id = 'avatars' and auth.uid()::text = (storage.foldername(name))[1]);

-- create policy "Anyone can view avatars"
-- on storage.objects for select
-- using (bucket_id = 'avatars');

-- create policy "Users can update own avatar"
-- on storage.objects for update
-- to authenticated
-- using (bucket_id = 'avatars' and auth.uid()::text = (storage.foldername(name))[1]);

-- create policy "Users can delete own avatar"
-- on storage.objects for delete
-- to authenticated
-- using (bucket_id = 'avatars' and auth.uid()::text = (storage.foldername(name))[1]);
