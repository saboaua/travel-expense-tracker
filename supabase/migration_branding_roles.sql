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

-- Storage for logos (create bucket 'branding' as public in dashboard)
-- insert into storage.buckets (id, name, public) values ('branding', 'branding', true);
