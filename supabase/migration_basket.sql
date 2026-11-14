-- Best store for your list: the shopping list and the places of the stores. Run once in the Supabase SQL Editor.

create table if not exists public.shopping_list_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  product_key text not null check (char_length(product_key) between 1 and 300),
  name text not null check (char_length(name) between 1 and 160),
  qty integer not null default 1 check (qty between 1 and 99),
  created_at timestamptz not null default now(),
  unique (user_id, product_key)
);
create index if not exists shopping_list_items_user_idx on public.shopping_list_items (user_id);

-- Stores you pinned or added. Only your own places and open map data (OpenStreetMap); nothing copied from Google Maps.
create table if not exists public.store_locations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 120),
  lat double precision not null check (lat between -90 and 90),
  lng double precision not null check (lng between -180 and 180),
  source text not null default 'pin' check (source in ('pin', 'osm', 'manual')),
  osm_id text,
  created_at timestamptz not null default now()
);
create index if not exists store_locations_user_idx on public.store_locations (user_id);

alter table public.shopping_list_items enable row level security;
alter table public.store_locations enable row level security;

drop policy if exists "Own shopping list" on public.shopping_list_items;
create policy "Own shopping list" on public.shopping_list_items
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

drop policy if exists "Own store locations" on public.store_locations;
create policy "Own store locations" on public.store_locations
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));
