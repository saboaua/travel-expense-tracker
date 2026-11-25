-- Directory categories: a store or place can be a supermarket, clothing, health & nutrition or other.
-- Run once in the Supabase SQL Editor. Safe to run again. Everything stays a supermarket until an admin moves it.

-- Which category an admin gave a community store (a store with no row here is a supermarket).
create table if not exists public.store_categories (
  country text not null check (country ~ '^[A-Z]{2}$'),
  store_key text not null check (char_length(store_key) between 1 and 160),
  category text not null check (category in ('supermarkets', 'clothing', 'health', 'other')),
  updated_at timestamptz not null default now(),
  primary key (country, store_key)
);
alter table public.store_categories enable row level security;
-- No policies: only the server (service role) reads and writes it, for the admin pages.

-- Places get a category too, and places added by hand are kept when a new list is imported.
alter table public.supermarket_places add column if not exists category text not null default 'supermarkets' check (category in ('supermarkets', 'clothing', 'health', 'other'));
alter table public.supermarket_places add column if not exists added boolean not null default false;
