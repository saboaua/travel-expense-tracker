-- Pro payments by Bitcoin. Run once in the Supabase SQL Editor, after migration_pro_payments.sql. Safe to run again.
-- The admin pastes receiving addresses from their own wallet. Each request gets one address, a locked amount and a time limit.
-- The app never holds a key. The admin checks the wallet and confirms, like a bank transfer.

alter table public.payment_settings add column if not exists btc_enabled boolean not null default false;
alter table public.payment_settings add column if not exists btc_quote_minutes int not null default 30 check (btc_quote_minutes between 5 and 120);
alter table public.payment_settings add column if not exists btc_confirmations int not null default 2 check (btc_confirmations between 0 and 12);

-- The address pool. Only the server reads it (no policy for signed-in users).
create table if not exists public.btc_addresses (
  address text primary key,
  payment_id uuid,
  created_at timestamptz not null default now()
);
alter table public.btc_addresses enable row level security;
create index if not exists btc_addresses_free_idx on public.btc_addresses (created_at) where payment_id is null;

alter table public.plan_payments add column if not exists btc_address text;
alter table public.plan_payments add column if not exists btc_amount numeric(18,8);
alter table public.plan_payments add column if not exists btc_rate_usd numeric(14,2);
alter table public.plan_payments add column if not exists expires_at timestamptz;
alter table public.plan_payments add column if not exists txid text;
alter table public.plan_payments add column if not exists claimed_at timestamptz;

alter table public.plan_payments drop constraint if exists plan_payments_method_check;
alter table public.plan_payments add constraint plan_payments_method_check check (method in ('aruba_bank','cmb','cash','other','bitcoin'));
alter table public.plan_payments drop constraint if exists plan_payments_status_check;
alter table public.plan_payments add constraint plan_payments_status_check check (status in ('pending','confirmed','rejected','expired'));

-- People may ask for Pro by bank themselves. Bitcoin requests are created by the server only.
drop policy if exists "Ask for Pro" on public.plan_payments;
create policy "Ask for Pro" on public.plan_payments for insert to authenticated with check (user_id = auth.uid() and status = 'pending' and method <> 'bitcoin');
