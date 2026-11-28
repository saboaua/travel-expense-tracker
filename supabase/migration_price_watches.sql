-- Price watches: tell me when a product I buy gets cheaper. Run in the Supabase SQL Editor (safe to run more than once).

create table if not exists public.price_watches (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  -- the product as the Price tracker knows it, and its name for lists and messages
  product_key text not null check (char_length(product_key) between 1 and 300),
  name text not null check (char_length(name) between 1 and 160),
  currency text not null default 'AWG',
  -- below_last: cheaper than the price in `target` (what was last paid); at_or_below: the price in `target` or less
  rule text not null check (rule in ('below_last', 'at_or_below')),
  target numeric(12, 2) not null check (target > 0),
  paused boolean not null default false,
  -- the price and store the last alert was about: the same price is never announced twice, and a drop below it is announced again
  last_alert_price numeric(12, 2),
  last_alert_store text,
  last_alert_on date,
  created_at timestamptz not null default now(),
  unique (user_id, product_key)
);
create index if not exists price_watches_active_idx on public.price_watches (user_id) where not paused;

alter table public.price_watches enable row level security;
drop policy if exists "Own price watches" on public.price_watches;
create policy "Own price watches" on public.price_watches
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- The Pro limit: a start day plus the Free and Pro numbers. The limit starts today the first time this runs.
do $$
begin
  if not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'pro_limits' and column_name = 'starts_price_watches') then
    alter table public.pro_limits add column starts_price_watches date;
    update public.pro_limits set starts_price_watches = current_date where id = 1;
  end if;
end $$;
alter table public.pro_limits add column if not exists free_price_watches int not null default 3 check (free_price_watches between 0 and 1000);
alter table public.pro_limits add column if not exists pro_price_watches int not null default 30 check (pro_price_watches between 1 and 10000);

notify pgrst, 'reload schema';
