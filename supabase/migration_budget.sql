-- Migration 61: Monthly budget (Personal). One budget that applies every month, and optional different ones for single months.
-- Run in the Supabase SQL Editor (safe to run more than once). Needs migration_personal.sql first.
-- month is the first day of the month the budget is only for; empty means "every month".
-- limits keeps the optional limit for each area, e.g. {"groceries": 700, "utilities": 350}.
-- alert_at_80: send a phone alert once a month when 80% of the budget is used (and once more if it goes over).

create table if not exists public.personal_budgets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  month date check (month is null or extract(day from month) = 1),
  amount numeric(12,2) not null check (amount > 0),
  currency text not null default 'AWG' check (currency in ('AWG', 'USD')),
  limits jsonb not null default '{}'::jsonb,
  alert_at_80 boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists personal_budgets_user_month_idx
  on public.personal_budgets (user_id, coalesce(month, date '1900-01-01'));

drop trigger if exists personal_budgets_touch on public.personal_budgets;
create trigger personal_budgets_touch before update on public.personal_budgets
  for each row execute function public.personal_touch_updated_at();

alter table public.personal_budgets enable row level security;
drop policy if exists "Own budgets" on public.personal_budgets;
create policy "Own budgets" on public.personal_budgets
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));
