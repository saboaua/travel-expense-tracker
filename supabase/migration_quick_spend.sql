-- Migration 53: Quick spend (Personal). Purchases with no receipt: a coffee, street food, anything small.
-- Run in the Supabase SQL Editor (safe to run more than once). Needs migration_personal.sql first.
-- Private to the owner, like the rest of Personal. Business trips are not touched: they still need a receipt.

create table if not exists public.personal_spends (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  merchant text check (merchant is null or char_length(merchant) <= 120),
  amount numeric(12,2) not null check (amount >= 0),
  currency text not null default 'AWG',
  exchange_rate numeric(18,8) not null default 1,
  amount_usd numeric(12,2) not null default 0,
  category text not null default 'Other' check (char_length(category) <= 60),
  expense_date date not null default current_date,
  notes text check (notes is null or char_length(notes) <= 500),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists personal_spends_user_date_idx on public.personal_spends (user_id, expense_date desc);

drop trigger if exists personal_spends_touch on public.personal_spends;
create trigger personal_spends_touch before update on public.personal_spends
  for each row execute function public.personal_touch_updated_at();

alter table public.personal_spends enable row level security;
drop policy if exists "Own personal spends" on public.personal_spends;
create policy "Own personal spends" on public.personal_spends
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));
