-- Branding + expanded roles
-- Run in Supabase SQL Editor

-- Allow assistant role
alter table public.profiles
  drop constraint if exists profiles_role_check;

alter table public.profiles
  add constraint profiles_role_check
  check (role in ('user', 'assistant', 'admin'));

-- App-wide branding / settings (single row)
create table if not exists public.app_settings (
  id int primary key default 1 check (id = 1),
  app_name text default 'Travel Expense Tracker',
  logo_url text,
  primary_color text default '#4f46e5',  -- indigo-600
  updated_at timestamptz default now(),
  updated_by uuid references public.profiles(id) on delete set null
);

insert into public.app_settings (id, app_name, primary_color)
values (1, 'Travel Expense Tracker', '#4f46e5')
on conflict (id) do nothing;

alter table public.app_settings enable row level security;

-- Everyone authenticated can read branding (login page needs it too via anon if needed)
create policy "Anyone can read app settings"
  on public.app_settings for select
  using (true);

create policy "Admins can update app settings"
  on public.app_settings for update
  using (
    exists (
      select 1 from public.profiles
      where id = auth.uid() and role = 'admin'
    )
  );

create policy "Admins can insert app settings"
  on public.app_settings for insert
  with check (
    exists (
      select 1 from public.profiles
      where id = auth.uid() and role = 'admin'
    )
  );

-- Storage for logos
-- Create the bucket as public in the Supabase dashboard (Storage → New bucket → name: branding, public: true)
-- or uncomment and run:
-- insert into storage.buckets (id, name, public) values ('branding', 'branding', true)
--   on conflict (id) do nothing;

-- Policies on storage.objects (required for uploads; upsert needs INSERT + SELECT + UPDATE)
drop policy if exists "Admins can upload branding" on storage.objects;
drop policy if exists "Admins can update branding" on storage.objects;
drop policy if exists "Admins can read branding" on storage.objects;
drop policy if exists "Public can read branding" on storage.objects;

create policy "Admins can upload branding"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'branding'
    and exists (
      select 1 from public.profiles
      where id = auth.uid() and role = 'admin'
    )
  );

create policy "Admins can update branding"
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'branding'
    and exists (
      select 1 from public.profiles
      where id = auth.uid() and role = 'admin'
    )
  );

create policy "Public can read branding"
  on storage.objects for select
  using (bucket_id = 'branding');
