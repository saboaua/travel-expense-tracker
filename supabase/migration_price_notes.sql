-- Migration 58: Price notes. Keep prices without counting them as spending.
-- Run in the Supabase SQL Editor (safe to run more than once). Needs migration_personal.sql first.
--  1. grocery_receipts.prices_only: a receipt you scanned or typed only to keep its prices (you did not pay for it).
--     It still feeds the Price tracker but is left out of every spending total.
--  2. price_checks: a price you saw in a shop (product, store, price, size, date, optional shelf-tag photo).
--     The Price tracker compares these with your receipts.

alter table public.grocery_receipts add column if not exists prices_only boolean not null default false;

create table if not exists public.price_checks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  product text not null check (char_length(product) between 1 and 160),
  store text not null check (char_length(store) between 1 and 120),
  price numeric(12,2) not null check (price >= 0),
  currency text not null default 'AWG',
  size text check (size is null or char_length(size) <= 60),
  seen_on date not null default current_date,
  photo_path text check (photo_path is null or char_length(photo_path) <= 300),
  notes text check (notes is null or char_length(notes) <= 500),
  created_at timestamptz not null default now()
);
create index if not exists price_checks_user_seen_idx on public.price_checks (user_id, seen_on desc);

alter table public.price_checks enable row level security;
drop policy if exists "Own price checks" on public.price_checks;
create policy "Own price checks" on public.price_checks
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));
