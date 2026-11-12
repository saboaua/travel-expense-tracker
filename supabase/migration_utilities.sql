-- Migration 56: Utilities (Personal). Water, electricity, septic, trash, phone, internet bills that you add yourself.
-- Run in the Supabase SQL Editor (safe to run more than once). Needs migration_personal.sql first.
-- There is no link to the utility companies: you enter each bill. Private to the owner, like the rest of Personal.
-- utility_prefs keeps the day of the month you chose for a reminder to add your bills (the daily job sends it).

create table if not exists public.utility_bills (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null check (kind in ('water', 'electricity', 'septic', 'trash', 'phone', 'internet', 'other')),
  provider text check (provider is null or char_length(provider) <= 80),
  bill_month date not null check (extract(day from bill_month) = 1),
  amount numeric(12,2) not null check (amount >= 0),
  currency text not null default 'AWG',
  exchange_rate numeric(18,8) not null default 1,
  amount_usd numeric(12,2) not null default 0,
  paid_on date,
  due_date date,
  receipt_path text check (receipt_path is null or char_length(receipt_path) <= 300),
  notes text check (notes is null or char_length(notes) <= 500),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists utility_bills_user_kind_idx on public.utility_bills (user_id, kind, bill_month desc);

drop trigger if exists utility_bills_touch on public.utility_bills;
create trigger utility_bills_touch before update on public.utility_bills
  for each row execute function public.personal_touch_updated_at();

alter table public.utility_bills enable row level security;
drop policy if exists "Own utility bills" on public.utility_bills;
create policy "Own utility bills" on public.utility_bills
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create table if not exists public.utility_prefs (
  user_id uuid primary key references auth.users(id) on delete cascade,
  remind_day smallint check (remind_day is null or remind_day between 1 and 28),
  updated_at timestamptz not null default now()
);
alter table public.utility_prefs enable row level security;
drop policy if exists "Own utility prefs" on public.utility_prefs;
create policy "Own utility prefs" on public.utility_prefs
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));
