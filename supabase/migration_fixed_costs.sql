-- Fixed costs (Personal): home mortgage, insurance, car loan, car insurance, license plate, credit card and a gambling limit.
-- Run in the Supabase SQL Editor (safe to run more than once). Needs migration_personal.sql first (personal_touch_updated_at).
-- fixed_costs: one row per kind per person.
--   schedule monthly       = the same amount every month, from start_month to end_month (empty end = no end)
--   schedule yearly        = once a year, in due_month
--   schedule twice_yearly  = two payments a year: amount in due_month, amount2 in due_month2
--   schedule statement     = credit card: you enter what you spent (fixed_entries)
--   schedule limit         = gambling: amount is the most you can afford each month
-- fixed_entries: what you spent on the credit card (kind card) or on gambling (kind gambling), one row per entry.

create table if not exists public.fixed_costs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null check (kind in ('mortgage','home_insurance','car_loan','car_insurance','license_plate','credit_card','gambling')),
  schedule text not null check (schedule in ('monthly','yearly','twice_yearly','statement','limit')),
  amount numeric(12,2) not null default 0 check (amount >= 0),
  amount2 numeric(12,2) check (amount2 is null or amount2 >= 0),
  currency text not null default 'AWG' check (currency in ('AWG','USD')),
  day smallint check (day is null or day between 1 and 28),
  due_month smallint check (due_month is null or due_month between 1 and 12),
  due_month2 smallint check (due_month2 is null or due_month2 between 1 and 12),
  start_month date check (start_month is null or extract(day from start_month) = 1),
  end_month date check (end_month is null or extract(day from end_month) = 1),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, kind)
);

create table if not exists public.fixed_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null check (kind in ('card','gambling')),
  on_date date not null,
  amount numeric(12,2) not null check (amount > 0 and amount < 100000000),
  currency text not null default 'AWG' check (currency in ('AWG','USD')),
  created_at timestamptz not null default now()
);
create index if not exists fixed_entries_user_idx on public.fixed_entries (user_id, kind, on_date desc);

drop trigger if exists fixed_costs_touch on public.fixed_costs;
create trigger fixed_costs_touch before update on public.fixed_costs
  for each row execute function public.personal_touch_updated_at();

alter table public.fixed_costs enable row level security;
drop policy if exists "Own fixed costs" on public.fixed_costs;
create policy "Own fixed costs" on public.fixed_costs
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

alter table public.fixed_entries enable row level security;
drop policy if exists "Own fixed entries" on public.fixed_entries;
create policy "Own fixed entries" on public.fixed_entries
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

notify pgrst, 'reload schema';
