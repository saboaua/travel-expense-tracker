-- Migration 51: Price tracker, online supermarket prices (Super Food Plaza and Ling & Sons).
-- Run in the Supabase SQL Editor (safe to run more than once). Needs migration_personal.sql first.
-- store_catalog is the shared copy of each shop's public product list (no personal data); it is filled once a day by the
-- server (needs CRON_SECRET and SUPABASE_SERVICE_ROLE_KEY on Vercel). Everyone signed in can read it, nobody can write it.
-- grocery_online_matches keeps your Yes / No answers on "is this the same product?", and grocery_online_prefs which shops you use.

create table if not exists public.store_catalog (
  store text not null check (store in ('superfood', 'ling')),
  item_id text not null check (char_length(item_id) <= 120),
  name text not null check (char_length(name) <= 200),
  name_norm text not null check (char_length(name_norm) <= 300),
  size_text text check (char_length(size_text) <= 40),
  price numeric(10, 2) not null check (price > 0),
  currency text not null default 'AWG',
  url text check (char_length(url) <= 500),
  fetched_at timestamptz not null default now(),
  primary key (store, item_id)
);
create index if not exists store_catalog_fetched_idx on public.store_catalog (store, fetched_at);

alter table public.store_catalog enable row level security;
drop policy if exists "Read store catalog" on public.store_catalog;
create policy "Read store catalog" on public.store_catalog for select to authenticated using (true);

create table if not exists public.grocery_online_matches (
  user_id uuid not null references public.profiles(id) on delete cascade,
  product_key text not null check (char_length(product_key) <= 300),
  store text not null check (store in ('superfood', 'ling')),
  item_id text not null check (char_length(item_id) <= 120),
  same boolean not null,
  created_at timestamptz not null default now(),
  primary key (user_id, product_key, store, item_id)
);
alter table public.grocery_online_matches enable row level security;
drop policy if exists "Own online matches" on public.grocery_online_matches;
create policy "Own online matches" on public.grocery_online_matches
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create table if not exists public.grocery_online_prefs (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  stores text[] not null default '{superfood,ling}',
  updated_at timestamptz not null default now()
);
alter table public.grocery_online_prefs enable row level security;
drop policy if exists "Own online prefs" on public.grocery_online_prefs;
create policy "Own online prefs" on public.grocery_online_prefs
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));
