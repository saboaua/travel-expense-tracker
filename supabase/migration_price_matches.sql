-- Migration 49: Price tracker, "same product" answers.
-- Run in the Supabase SQL Editor (safe to run more than once). Needs migration_personal.sql first.
-- When two grocery items look alike but Lifolio is not sure, you answer Yes (combine) or No (keep apart).
-- The answer is kept here so it sticks. Each row is one pair of item wordings (the app always stores the pair in sorted order); they are private to their owner.

create table if not exists public.grocery_price_matches (
  user_id uuid not null references public.profiles(id) on delete cascade,
  key_a text not null check (char_length(key_a) <= 300),
  key_b text not null check (char_length(key_b) <= 300),
  same boolean not null,
  created_at timestamptz not null default now(),
  primary key (user_id, key_a, key_b)
);

alter table public.grocery_price_matches enable row level security;

drop policy if exists "Own price matches" on public.grocery_price_matches;
create policy "Own price matches" on public.grocery_price_matches
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));
