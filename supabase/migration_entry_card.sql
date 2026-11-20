-- Aruba re-entry card helper. Run once in the Supabase SQL Editor. Safe to run again.
-- entry_card_details: your details for entry cards (one row per person, private to you).
-- trip_entry_cards: which trips you marked the card as done.

create table if not exists public.entry_card_details (
  user_id uuid primary key references auth.users(id) on delete cascade,
  last_name text not null default '',
  first_name text not null default '',
  passport_number text not null default '',
  nationality text not null default '',
  birth_date date,
  gender text not null default '' check (gender in ('', 'Male', 'Female')),
  birth_country text not null default '',
  email text not null default '',
  updated_at timestamptz not null default now()
);
alter table public.entry_card_details enable row level security;
drop policy if exists "Own entry card details" on public.entry_card_details;
create policy "Own entry card details" on public.entry_card_details
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create table if not exists public.trip_entry_cards (
  trip_id uuid primary key references public.trips(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  done_at timestamptz not null default now()
);
create index if not exists trip_entry_cards_user_idx on public.trip_entry_cards (user_id);
alter table public.trip_entry_cards enable row level security;
drop policy if exists "Own trip entry card" on public.trip_entry_cards;
create policy "Own trip entry card" on public.trip_entry_cards
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (
    user_id = (select auth.uid())
    and exists (select 1 from public.trips t where t.id = trip_id and t.user_id = (select auth.uid()))
  );

notify pgrst, 'reload schema';
