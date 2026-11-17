-- Fuel tracker (Personal): each time you fill the tank. Run once in the Supabase SQL Editor (safe to run more than once).
-- Needs migration_personal.sql first. Private to the owner, like the rest of Personal.
-- amount is what you paid. quantity (litres or gallons, as entered) and price_per_unit are optional: a fill-up can be just the total.

create table if not exists public.fuel_fillups (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  fill_date date not null default current_date,
  unit text not null default 'L' check (unit in ('L', 'gal')),
  quantity numeric(10,3) check (quantity is null or (quantity > 0 and quantity < 100000)),
  price_per_unit numeric(10,4) check (price_per_unit is null or (price_per_unit > 0 and price_per_unit < 100000)),
  amount numeric(12,2) not null check (amount > 0 and amount < 10000000),
  currency text not null default 'AWG' check (currency in ('AWG', 'USD')),
  amount_usd numeric(12,2) not null default 0,
  station text check (station is null or char_length(station) <= 120),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists fuel_fillups_user_date_idx on public.fuel_fillups (user_id, fill_date desc);

drop trigger if exists fuel_fillups_touch on public.fuel_fillups;
create trigger fuel_fillups_touch before update on public.fuel_fillups
  for each row execute function public.personal_touch_updated_at();

alter table public.fuel_fillups enable row level security;
drop policy if exists "Own fuel fill-ups" on public.fuel_fillups;
create policy "Own fuel fill-ups" on public.fuel_fillups
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

notify pgrst, 'reload schema';
