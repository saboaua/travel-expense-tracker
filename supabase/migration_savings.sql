-- Migration 62: Savings plans (Personal). Put an amount aside every month, or until a date, and see how much you have saved.
-- Run in the Supabase SQL Editor (safe to run more than once). Needs migration_personal.sql first.
-- start_date is the first deposit; the deposit falls on the same day of each month. end_date is the last deposit (empty: no end).
-- opening_balance is what you had saved before the plan started. paused_on stops deposits from that date on.
-- savings_events: kind 'skip' leaves one month out (month = first day of it); kind 'extra' adds a one-off deposit in that month.

create table if not exists public.savings_plans (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 80),
  amount numeric(12,2) not null check (amount > 0),
  currency text not null default 'AWG' check (currency in ('AWG', 'USD')),
  start_date date not null,
  end_date date check (end_date is null or end_date >= start_date),
  opening_balance numeric(12,2) not null default 0 check (opening_balance >= 0),
  goal numeric(12,2) check (goal is null or goal > 0),
  paused_on date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists savings_plans_user_idx on public.savings_plans (user_id);

create table if not exists public.savings_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  plan_id uuid not null references public.savings_plans(id) on delete cascade,
  kind text not null check (kind in ('skip', 'extra')),
  month date not null check (extract(day from month) = 1),
  amount numeric(12,2) check (amount is null or amount > 0),
  created_at timestamptz not null default now()
);
create index if not exists savings_events_plan_idx on public.savings_events (plan_id, month);
create unique index if not exists savings_events_skip_idx on public.savings_events (plan_id, month) where kind = 'skip';

drop trigger if exists savings_plans_touch on public.savings_plans;
create trigger savings_plans_touch before update on public.savings_plans
  for each row execute function public.personal_touch_updated_at();

alter table public.savings_plans enable row level security;
drop policy if exists "Own savings plans" on public.savings_plans;
create policy "Own savings plans" on public.savings_plans
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

alter table public.savings_events enable row level security;
drop policy if exists "Own savings events" on public.savings_events;
create policy "Own savings events" on public.savings_events
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));
