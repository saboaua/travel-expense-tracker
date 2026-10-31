-- Admin roles + force password change
-- Run this in Supabase SQL Editor

-- Role and must_change_password on profiles
alter table public.profiles
  add column if not exists role text not null default 'user'
    check (role in ('user', 'admin')),
  add column if not exists must_change_password boolean not null default false;

-- Optional: promote your own account to admin (replace with your email)
-- update public.profiles
-- set role = 'admin'
-- where email = 'your-admin@email.com';

-- Index for role lookups
create index if not exists idx_profiles_role on public.profiles(role);
