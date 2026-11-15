-- Pro payments by bank transfer. Run once in the Supabase SQL Editor. Safe to run again.
-- The admin sets prices and bank accounts; a user asks for Pro with a reference; the admin confirms when the money is in.

create table if not exists public.payment_settings (
  id int primary key default 1 check (id = 1),
  currency text not null default 'AWG',
  monthly_price numeric(10,2) not null default 0,
  yearly_price numeric(10,2) not null default 0,
  accounts jsonb not null default '[]'::jsonb,
  instructions text not null default '',
  updated_at timestamptz not null default now()
);
alter table public.payment_settings enable row level security;
drop policy if exists "Anyone signed in can read payment settings" on public.payment_settings;
create policy "Anyone signed in can read payment settings" on public.payment_settings for select to authenticated using (true);
insert into public.payment_settings (id) values (1) on conflict (id) do nothing;

create table if not exists public.plan_payments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  period text not null check (period in ('monthly','yearly')),
  amount numeric(10,2) not null check (amount >= 0),
  currency text not null default 'AWG',
  method text not null default 'other' check (method in ('aruba_bank','cmb','cash','other')),
  reference text not null default '',
  note text,
  status text not null default 'pending' check (status in ('pending','confirmed','rejected')),
  paid_on date,
  created_at timestamptz not null default now(),
  decided_at timestamptz,
  decided_by uuid references auth.users(id) on delete set null
);
create index if not exists plan_payments_user_idx on public.plan_payments (user_id, created_at desc);
create unique index if not exists plan_payments_one_pending on public.plan_payments (user_id) where status = 'pending';
alter table public.plan_payments enable row level security;
drop policy if exists "Read own payments" on public.plan_payments;
create policy "Read own payments" on public.plan_payments for select to authenticated using (user_id = auth.uid());
drop policy if exists "Ask for Pro" on public.plan_payments;
create policy "Ask for Pro" on public.plan_payments for insert to authenticated with check (user_id = auth.uid() and status = 'pending');
