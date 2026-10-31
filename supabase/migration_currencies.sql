-- Currencies the app can offer. Admins choose which ones appear.
-- Run in the Supabase SQL Editor.

create table if not exists public.currencies (
  code text primary key,
  name text not null,
  enabled boolean not null default true,
  usd_rate numeric(16, 6),
  sort_order int not null default 100,
  created_at timestamptz default now()
);

insert into public.currencies (code, name, enabled, usd_rate, sort_order) values
  ('USD', 'US Dollar', true, 1, 1),
  ('EUR', 'Euro', true, null, 2),
  ('GBP', 'British Pound', true, null, 3),
  ('AWG', 'Aruban Florin', true, 0.558659, 4),
  ('XCD', 'Eastern Caribbean Dollar (Grenada, St Lucia)', true, 0.370370, 5),
  ('GYD', 'Guyanese Dollar', true, 0.004785, 6),
  ('SRD', 'Surinamese Dollar', true, 0.027027, 7),
  ('CAD', 'Canadian Dollar', true, null, 10),
  ('MXN', 'Mexican Peso', true, null, 11),
  ('BRL', 'Brazilian Real', true, null, 12),
  ('CHF', 'Swiss Franc', true, null, 13),
  ('JPY', 'Japanese Yen', true, null, 14),
  ('CNY', 'Chinese Yuan', true, null, 15),
  ('INR', 'Indian Rupee', true, null, 16),
  ('AUD', 'Australian Dollar', true, null, 17),
  ('NZD', 'New Zealand Dollar', true, null, 18),
  ('SGD', 'Singapore Dollar', true, null, 19),
  ('HKD', 'Hong Kong Dollar', true, null, 20),
  ('SEK', 'Swedish Krona', true, null, 21),
  ('NOK', 'Norwegian Krone', true, null, 22),
  ('DKK', 'Danish Krone', true, null, 23),
  ('ZAR', 'South African Rand', true, null, 24),
  ('AED', 'UAE Dirham', true, 0.272294, 25)
on conflict (code) do nothing;

alter table public.currencies enable row level security;

drop policy if exists "Authenticated can read currencies" on public.currencies;
create policy "Authenticated can read currencies"
  on public.currencies for select
  to authenticated
  using (true);

drop policy if exists "Admins manage currencies" on public.currencies;
create policy "Admins manage currencies"
  on public.currencies for all
  to authenticated
  using (exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'admin'
  ))
  with check (exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'admin'
  ));

notify pgrst, 'reload schema';
