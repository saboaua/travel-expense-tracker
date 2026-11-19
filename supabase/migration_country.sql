-- Prices by country. Run once in the Supabase SQL Editor (safe to run more than once). Needs migration_shared_prices.sql,
-- migration_badges.sql, migration_nightly_share.sql, migration_community_confirm.sql and migration_supermarket_places.sql first.
--
--  * supermarket_places, shared_prices and store_catalog get a two-letter country. Everything already there is Aruba ("AW").
--  * community_search can be limited to one country, so a Suriname shopper never sees Aruba prices and the other way round.
--  * Shared prices carry the country they were paid in (from the app, or from the currency when only one country uses it).
--  * Groceries traveler badge: the countries a person has shared prices in (share_countries). Two or more earns the badge, for life.
--  * price_countries() lists the countries that have stores or prices, for the country switch.

alter table public.supermarket_places add column if not exists country text not null default 'AW' check (country ~ '^[A-Z]{2}$');
create index if not exists supermarket_places_country_idx on public.supermarket_places (country);
alter table public.store_catalog add column if not exists country text not null default 'AW' check (country ~ '^[A-Z]{2}$');
alter table public.shared_prices add column if not exists country text check (country is null or country ~ '^[A-Z]{2}$');
update public.shared_prices set country = 'AW' where country is null and currency = 'AWG';
create index if not exists shared_prices_country_idx on public.shared_prices (country, product_key);
alter table public.profiles add column if not exists share_countries text[] not null default '{}';
alter table public.profiles add column if not exists traveler_seen boolean not null default false;

-- The country that uses a currency alone. Shared currencies (USD, EUR) return null: the app sends the country for those.
create or replace function public._country_of_currency(cur text) returns text
language sql immutable as $$
  select case upper(cur)
    when 'AWG' then 'AW' when 'SRD' then 'SR' when 'ANG' then 'CW' when 'XCG' then 'CW' when 'GYD' then 'GY' when 'TTD' then 'TT'
    when 'BBD' then 'BB' when 'JMD' then 'JM' when 'COP' then 'CO' when 'VES' then 'VE' when 'BRL' then 'BR' when 'DOP' then 'DO'
    when 'HTG' then 'HT' when 'MXN' then 'MX' when 'CAD' then 'CA' when 'GBP' then 'GB' else null end
$$;

create or replace function public._note_countries(uid uuid, cs text[]) returns void
language sql security definer set search_path = public as $$
  update public.profiles
     set share_countries = (select coalesce(array_agg(distinct c order by c), '{}') from unnest(share_countries || coalesce(cs, '{}')) as c where c is not null)
   where id = uid and coalesce(cardinality(cs), 0) > 0
$$;
revoke all on function public._note_countries(uuid, text[]) from public, anon, authenticated;

create or replace function public.share_prices(rows jsonb) returns integer
language plpgsql security definer set search_path = public as $$
declare
  me text;
  n integer := 0;
  fresh integer := 0;
  r jsonb;
  ctry text;
  cs text[] := '{}';
  m date := date_trunc('month', current_date)::date;
  sk text;
  pk text;
  added integer;
begin
  if auth.uid() is null then raise exception 'Sign in first'; end if;
  if not coalesce((select share_prices from public.profiles where id = auth.uid()), false) then return 0; end if;
  if jsonb_typeof(rows) <> 'array' or jsonb_array_length(rows) > 300 then raise exception 'Too many rows'; end if;
  me := public._price_contributor_of(auth.uid());
  for r in select * from jsonb_array_elements(rows) loop
    begin
      ctry := coalesce(nullif(upper(left(r->>'country', 2)), ''), public._country_of_currency(upper(left(r->>'currency', 3))));
      sk := left(lower(r->>'store_key'), 120);
      pk := left(lower(r->>'product_key'), 200);
      insert into public.shared_prices (contributor, store_key, store_name, product_key, product_name, size_label, currency, price, month, country)
      values (me, sk, left(r->>'store_name', 120), pk, left(r->>'product_name', 160),
              nullif(left(r->>'size_label', 40), ''), upper(left(r->>'currency', 3)), (r->>'price')::numeric, m, ctry)
      on conflict (contributor, store_key, product_key, month)
      do update set price = excluded.price, store_name = excluded.store_name, product_name = excluded.product_name, country = excluded.country;
      n := n + 1;
      if ctry is not null then cs := cs || ctry; end if;
      insert into public.price_share_seen (contributor, pair) values (me, encode(sha256(convert_to(sk || '|' || pk, 'UTF8')), 'hex'))
      on conflict do nothing;
      get diagnostics added = row_count;
      fresh := fresh + added;
    exception when others then
      null; -- a bad row is skipped
    end;
  end loop;
  if fresh > 0 then
    update public.profiles
       set shared_total = shared_total + fresh,
           badge_best = greatest(badge_best, public._badge_level(shared_total + fresh))
     where id = auth.uid();
  end if;
  perform public._note_countries(auth.uid(), cs);
  return n;
end $$;

create or replace function public.share_prices_for(uid uuid, rows jsonb, replace_month boolean default true) returns integer
language plpgsql security definer set search_path = public as $$
declare
  me text;
  n integer := 0;
  fresh integer := 0;
  r jsonb;
  ctry text;
  cs text[] := '{}';
  m date := date_trunc('month', current_date)::date;
  sk text;
  pk text;
  added integer;
  kept text[] := '{}';
begin
  if uid is null then raise exception 'No person'; end if;
  if not coalesce((select share_prices from public.profiles where id = uid), false) then return 0; end if;
  if jsonb_typeof(rows) <> 'array' or jsonb_array_length(rows) > 5000 then raise exception 'Too many rows'; end if;
  me := public._price_contributor_of(uid);
  for r in select * from jsonb_array_elements(rows) loop
    begin
      ctry := coalesce(nullif(upper(left(r->>'country', 2)), ''), public._country_of_currency(upper(left(r->>'currency', 3))));
      sk := left(lower(r->>'store_key'), 120);
      pk := left(lower(r->>'product_key'), 200);
      insert into public.shared_prices (contributor, store_key, store_name, product_key, product_name, size_label, currency, price, month, country)
      values (me, sk, left(r->>'store_name', 120), pk, left(r->>'product_name', 160),
              nullif(left(r->>'size_label', 40), ''), upper(left(r->>'currency', 3)), (r->>'price')::numeric, m, ctry)
      on conflict (contributor, store_key, product_key, month)
      do update set price = excluded.price, store_name = excluded.store_name, product_name = excluded.product_name, country = excluded.country;
      n := n + 1;
      if ctry is not null then cs := cs || ctry; end if;
      kept := kept || (sk || '|' || pk);
      insert into public.price_share_seen (contributor, pair) values (me, encode(sha256(convert_to(sk || '|' || pk, 'UTF8')), 'hex'))
      on conflict do nothing;
      get diagnostics added = row_count;
      fresh := fresh + added;
    exception when others then
      null; -- a bad row is skipped
    end;
  end loop;
  -- the full list replaces this month: prices no longer in the person's data are removed
  if replace_month then
    delete from public.shared_prices s
     where s.contributor = me and s.month = m and not ((s.store_key || '|' || s.product_key) = any (kept));
  end if;
  if fresh > 0 then
    update public.profiles
       set shared_total = shared_total + fresh,
           badge_best = greatest(badge_best, public._badge_level(shared_total + fresh))
     where id = uid;
  end if;
  update public.profiles set share_last_at = now(), share_last_count = n, share_last_error = false where id = uid;
  perform public._note_countries(uid, cs);
  return n;
end $$;

create or replace function public.import_prices(batch uuid, rows jsonb) returns integer
language plpgsql security definer set search_path = public as $$
declare
  me text;
  n integer := 0;
  r jsonb;
  ctry text;
  m date := date_trunc('month', current_date)::date;
begin
  if jsonb_typeof(rows) <> 'array' or jsonb_array_length(rows) > 1000 then raise exception 'Too many rows'; end if;
  me := encode(sha256(convert_to('import:' || batch::text || (select salt from public.price_share_secret where id = 1), 'UTF8')), 'hex');
  for r in select * from jsonb_array_elements(rows) loop
    begin
      ctry := coalesce(nullif(upper(left(r->>'country', 2)), ''), public._country_of_currency(upper(left(r->>'currency', 3))));
      insert into public.shared_prices (contributor, store_key, store_name, product_key, product_name, size_label, currency, price, month, country)
      values (me, left(lower(r->>'store_key'), 120), left(r->>'store_name', 120), left(lower(r->>'product_key'), 200), left(r->>'product_name', 160),
              nullif(left(r->>'size_label', 40), ''), upper(left(r->>'currency', 3)), (r->>'price')::numeric, m, ctry)
      on conflict (contributor, store_key, product_key, month) do nothing;
      n := n + 1;
    exception when others then
      null; -- a bad row is skipped
    end;
  end loop;
  return n;
end $$;

revoke all on function public.share_prices_for(uuid, jsonb, boolean) from public, anon, authenticated;
grant execute on function public.share_prices_for(uuid, jsonb, boolean) to service_role;
revoke all on function public.import_prices(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.import_prices(uuid, jsonb) to service_role;

-- Community prices for a search or exact product keys, limited to one country when ctry is given.
drop function if exists public.community_search(text, text[]);
drop function if exists public.community_search(text, text[], text);
create function public.community_search(q text default null, keys text[] default null, ctry text default null)
returns table (product_key text, product_name text, size_label text, currency text, store_name text, price numeric, reporters integer, last_month date, confirmed boolean)
language sql stable security definer set search_path = public as $$
  with recent as (
    select s.* from public.shared_prices s
    where s.month >= (date_trunc('month', current_date) - interval '2 months')::date
      and (ctry is null or s.country = upper(ctry))
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
  ),
  shop as (
    select u.product_key, u.currency, u.store_key, percentile_cont(0.5) within group (order by u.price) as gm
    from usable u group by u.product_key, u.currency, u.store_key
  )
  select u.product_key, max(u.product_name), max(u.size_label), u.currency, max(u.store_name),
         round(sh.gm::numeric, 2),
         count(distinct u.contributor)::integer, max(u.month),
         count(distinct u.contributor) filter (where u.price between sh.gm * 0.95 and sh.gm * 1.05) >= 3
  from usable u join shop sh on sh.product_key = u.product_key and sh.currency = u.currency and sh.store_key = u.store_key
  group by u.product_key, u.currency, u.store_key, sh.gm
  order by max(u.product_name), 6
  limit 300
$$;
revoke all on function public.community_search(text, text[], text) from public, anon;
grant execute on function public.community_search(text, text[], text) to authenticated;

-- Countries that have supermarket places or recent community prices (for the country switch).
create or replace function public.price_countries() returns table (country text, stores integer, prices integer)
language sql stable security definer set search_path = public as $$
  select c.country, coalesce(max(p.n), 0)::integer, coalesce(max(s.n), 0)::integer
  from (select country from public.supermarket_places union select country from public.shared_prices where country is not null) c
  left join (select country, count(*) n from public.supermarket_places group by country) p on p.country = c.country
  left join (select country, count(*) n from public.shared_prices where country is not null
              and month >= (date_trunc('month', current_date) - interval '2 months')::date group by country) s on s.country = c.country
  group by c.country order by c.country
$$;
revoke all on function public.price_countries() from public, anon;
grant execute on function public.price_countries() to authenticated, service_role;

-- Groceries traveler: the countries I shared prices in, and whether the unlock message was shown
create or replace function public.my_traveler() returns table (countries text[], seen boolean)
language sql stable security definer set search_path = public as $$
  select p.share_countries, p.traveler_seen from public.profiles p where p.id = auth.uid()
$$;
revoke all on function public.my_traveler() from public, anon;
grant execute on function public.my_traveler() to authenticated;

create or replace function public.ack_traveler() returns void
language sql security definer set search_path = public as $$
  update public.profiles set traveler_seen = true where id = auth.uid()
$$;
revoke all on function public.ack_traveler() from public, anon;
grant execute on function public.ack_traveler() to authenticated;

notify pgrst, 'reload schema';
