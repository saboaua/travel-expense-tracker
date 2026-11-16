-- Fix or remove a supermarket place by hand (Admin > Supermarket places). Run once in the Supabase SQL Editor, after migration_supermarket_places.sql.
-- A place fixed by hand is kept by the next file import. A place removed by hand is not brought back by it.

alter table public.supermarket_places add column if not exists fixed boolean not null default false;
alter table public.supermarket_places add column if not exists orig_lat double precision;
alter table public.supermarket_places add column if not exists orig_lng double precision;
alter table public.supermarket_places add column if not exists orig_key text;

create table if not exists public.supermarket_places_removed (
  name_key text not null check (char_length(name_key) <= 120),
  lat double precision not null,
  lng double precision not null,
  removed_at timestamptz not null default now(),
  primary key (name_key, lat, lng)
);
-- Only the server reads and writes this (no policies).
alter table public.supermarket_places_removed enable row level security;
