-- Supermarket places for the Best store map. Filled by an admin from an Excel or CSV file (Admin > Settings > Supermarket places).
-- Everyone signed in can read it, nobody can write it from the app. Run once in the Supabase SQL Editor.

create table if not exists public.supermarket_places (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 120),
  name_key text not null check (char_length(name_key) <= 120),
  address text check (char_length(address) <= 200),
  lat double precision not null check (lat between -90 and 90),
  lng double precision not null check (lng between -180 and 180),
  imported_at timestamptz not null default now(),
  unique (name_key, lat, lng)
);

alter table public.supermarket_places enable row level security;
drop policy if exists "Read supermarket places" on public.supermarket_places;
create policy "Read supermarket places" on public.supermarket_places for select to authenticated using (true);
