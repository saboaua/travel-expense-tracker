-- Community prices: people who turn it on share ONLY store, product and price, so everyone can see the best price.
-- Run once in the Supabase SQL Editor (safe to run more than once). Needs migration_personal.sql first.
--
-- Privacy by design:
--  * Nothing is shared until the person turns "Share my receipt prices" on (profiles.share_prices, off by default).
--  * shared_prices holds no name, email, account id, receipt, total, or receipt date (only the month a price arrived is kept, to expire old prices).
--  * Each row carries a one-way hash of the contributor (the account id mixed with a secret only the database knows). It is only
--    used to count how many different people reported a price and to let a person delete their own. Nobody can read this table:
--    it has no policies and no grants. The app can only call the functions below.
--  * A price is shown only when 3 or more different people reported it; the shown price is the middle (median) one, and prices
--    far from the usual (under 0.4x or over 2.5x the product's median) are ignored.

alter table public.profiles add column if not exists share_prices boolean not null default false;

-- The secret mixed into the one-way contributor id. Its own table: public.app_secrets already exists for Telegram with different columns.
create table if not exists public.price_share_secret (
  id integer primary key default 1 check (id = 1),
  salt text not null
);
alter table public.price_share_secret enable row level security;
revoke all on table public.price_share_secret from anon, authenticated;
insert into public.price_share_secret (id, salt)
values (1, replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''))
on conflict (id) do nothing;

create table if not exists public.shared_prices (
  id bigint generated always as identity primary key,
  contributor text not null,
  store_key text not null check (char_length(store_key) between 1 and 120),
  store_name text not null check (char_length(store_name) between 1 and 120),
  product_key text not null check (char_length(product_key) between 1 and 200),
  product_name text not null check (char_length(product_name) between 1 and 160),
  size_label text check (char_length(size_label) <= 40),
  currency text not null check (char_length(currency) = 3),
  price numeric(12, 2) not null check (price > 0 and price < 100000),
  month date not null,
  unique (contributor, store_key, product_key, month)
);
create index if not exists shared_prices_product_idx on public.shared_prices (product_key, month);
alter table public.shared_prices enable row level security;
revoke all on table public.shared_prices from anon, authenticated;

-- One-way id of a person, only for counting reporters and deleting their own rows
create or replace function public._price_contributor_of(uid uuid) returns text
language sql stable security definer set search_path = public as $$
  select encode(sha256(convert_to(uid::text || (select salt from public.price_share_secret where id = 1), 'UTF8')), 'hex')
$$;
revoke all on function public._price_contributor_of(uuid) from public, anon, authenticated;

-- Share rows of { store_key, store_name, product_key, product_name, size_label, currency, price }. No receipt date is sent: the database
-- stamps the month the row arrived, so old prices can expire. Does nothing unless the person opted in.
create or replace function public.share_prices(rows jsonb) returns integer
language plpgsql security definer set search_path = public as $$
declare
  me text;
  n integer := 0;
  r jsonb;
  m date := date_trunc('month', current_date)::date;
begin
  if auth.uid() is null then raise exception 'Sign in first'; end if;
  if not coalesce((select share_prices from public.profiles where id = auth.uid()), false) then return 0; end if;
  if jsonb_typeof(rows) <> 'array' or jsonb_array_length(rows) > 300 then raise exception 'Too many rows'; end if;
  me := public._price_contributor_of(auth.uid());
  for r in select * from jsonb_array_elements(rows) loop
    begin
      insert into public.shared_prices (contributor, store_key, store_name, product_key, product_name, size_label, currency, price, month)
      values (me, left(lower(r->>'store_key'), 120), left(r->>'store_name', 120), left(lower(r->>'product_key'), 200), left(r->>'product_name', 160),
              nullif(left(r->>'size_label', 40), ''), upper(left(r->>'currency', 3)), (r->>'price')::numeric, m)
      on conflict (contributor, store_key, product_key, month)
      do update set price = excluded.price, store_name = excluded.store_name, product_name = excluded.product_name;
      n := n + 1;
    exception when others then
      null; -- a bad row is skipped
    end;
  end loop;
  return n;
end $$;

-- Community prices for products matching a search (at least 2 letters), or for exact product keys. Only prices 3 or more people reported.
create or replace function public.community_search(q text default null, keys text[] default null)
returns table (product_key text, product_name text, size_label text, currency text, store_name text, price numeric, reporters integer, last_month date)
language sql stable security definer set search_path = public as $$
  with recent as (
    select s.* from public.shared_prices s
    where s.month >= (date_trunc('month', current_date) - interval '2 months')::date
      and ((keys is not null and s.product_key = any (keys))
        or (q is not null and char_length(btrim(q)) >= 2 and position(lower(btrim(q)) in lower(s.product_name)) > 0))
  ),
  mid as (
    select r.product_key, r.currency, percentile_cont(0.5) within group (order by r.price) as med
    from recent r group by r.product_key, r.currency
  ),
  usable as (
    select r.* from recent r join mid m on m.product_key = r.product_key and m.currency = r.currency
    where r.price between m.med * 0.4 and m.med * 2.5
  )
  select u.product_key, max(u.product_name), max(u.size_label), u.currency, max(u.store_name),
         round((percentile_cont(0.5) within group (order by u.price))::numeric, 2),
         count(distinct u.contributor)::integer, max(u.month)
  from usable u
  group by u.product_key, u.currency, u.store_key
  having count(distinct u.contributor) >= 3
  order by max(u.product_name), 6
  limit 200
$$;

-- A person removes everything they shared (their rows are found by the same one-way id)
create or replace function public.unshare_my_prices() returns integer
language plpgsql security definer set search_path = public as $$
declare n integer;
begin
  if auth.uid() is null then raise exception 'Sign in first'; end if;
  delete from public.shared_prices where contributor = public._price_contributor_of(auth.uid());
  get diagnostics n = row_count;
  return n;
end $$;

create or replace function public.my_shared_count() returns integer
language sql stable security definer set search_path = public as $$
  select count(*)::integer from public.shared_prices where contributor = public._price_contributor_of(auth.uid())
$$;

-- When an account is deleted the server removes that person's shared prices too (service role only)
create or replace function public.unshare_prices_of(uid uuid) returns integer
language plpgsql security definer set search_path = public as $$
declare n integer;
begin
  delete from public.shared_prices where contributor = public._price_contributor_of(uid);
  get diagnostics n = row_count;
  return n;
end $$;
revoke all on function public.unshare_prices_of(uuid) from public, anon, authenticated;
grant execute on function public.unshare_prices_of(uuid) to service_role;

revoke all on function public.share_prices(jsonb), public.community_search(text, text[]), public.unshare_my_prices(), public.my_shared_count() from public, anon;
grant execute on function public.share_prices(jsonb), public.community_search(text, text[]), public.unshare_my_prices(), public.my_shared_count() to authenticated;

-- Make the app notice the new column and functions straight away
notify pgrst, 'reload schema';
