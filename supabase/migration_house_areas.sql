-- Migration 60: House areas. Admin-managed areas of the house (Kitchen, Bathroom, Roof...) offered next to your
-- home projects when a Quick spend is categorised House, and a house_area column on personal_spends to remember the choice.
-- Run in the Supabase SQL Editor (safe to run more than once). Needs migration_quick_spend.sql and migration_house_spend.sql first.

create table if not exists public.house_areas (
  id uuid primary key default gen_random_uuid(),
  name text not null unique check (char_length(name) between 1 and 60),
  icon text not null default 'home',
  enabled boolean not null default true,
  sort_order int not null default 100,
  created_at timestamptz default now()
);

insert into public.house_areas (name, icon, sort_order) values
  ('Kitchen', 'home', 1),
  ('Bathroom', 'home', 2),
  ('Roof', 'home', 3),
  ('Garden', 'home', 4),
  ('Plumbing', 'home', 5),
  ('Electrical', 'home', 6),
  ('Paint', 'home', 7)
on conflict (name) do nothing;

alter table public.house_areas enable row level security;

drop policy if exists "Authenticated can read house areas" on public.house_areas;
create policy "Authenticated can read house areas"
  on public.house_areas for select
  to authenticated
  using (true);

drop policy if exists "Admins manage house areas" on public.house_areas;
create policy "Admins manage house areas"
  on public.house_areas for all
  to authenticated
  using (exists (select 1 from public.profiles where id = auth.uid() and role = 'admin'))
  with check (exists (select 1 from public.profiles where id = auth.uid() and role = 'admin'));

-- The area chosen on a spend. Deleting an area later keeps the name on spends you already saved.
alter table public.personal_spends add column if not exists house_area text check (house_area is null or char_length(house_area) <= 60);

notify pgrst, 'reload schema';
