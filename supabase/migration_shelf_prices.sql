-- Migration: add a price you see in the shop (shelf prices) for the community.
-- Run in the Supabase SQL Editor (safe to run more than once). Needs migration_country.sql and migration_nightly_share.sql first.
--  * Prices typed in a shop are kept apart from receipt prices (source = 'shelf'), so the nightly share of receipt prices never deletes them
--    and an older receipt price never replaces them.
--  * share_shelf_price saves one price (only when "Share my receipt prices" is on), at most 40 a day per person, and asks for a second look
--    when the price is far from what others reported. It counts toward the sharing badge like any shared price.
--  * my_shelf_prices lists what you added at a shop today, undo_shelf_price takes one back.
-- A sale price is saved as its own product (the key ends with |sale), so specials never mix with the normal price.

alter table public.shared_prices add column if not exists source text not null default 'receipt' check (source in ('receipt', 'shelf'));
alter table public.shared_prices add column if not exists created_at timestamptz not null default now();
create index if not exists shared_prices_shelf_idx on public.shared_prices (contributor, created_at) where source = 'shelf';

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
      do update set price = excluded.price, store_name = excluded.store_name, product_name = excluded.product_name, country = excluded.country
      where public.shared_prices.source = 'receipt'; -- a price typed in the shop is not replaced by an older receipt price
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
     where s.contributor = me and s.month = m and s.source = 'receipt' and not ((s.store_key || '|' || s.product_key) = any (kept));
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

create or replace function public.share_shelf_price(
  p_store_key text, p_store_name text, p_product_key text, p_product_name text, p_size text,
  p_price numeric, p_currency text, p_country text default null, p_sale boolean default false, p_force boolean default false
) returns text
language plpgsql security definer set search_path = public as $$
declare
  me text;
  ctry text;
  sk text := left(lower(btrim(p_store_key)), 120);
  pk text := left(lower(btrim(p_product_key)), 200);
  pn text := left(btrim(p_product_name), 160);
  cur text := upper(left(p_currency, 3));
  m date := date_trunc('month', current_date)::date;
  med numeric;
  cnt integer;
  today_n integer;
  added integer;
begin
  if auth.uid() is null then raise exception 'Sign in first'; end if;
  if not coalesce((select share_prices from public.profiles where id = auth.uid()), false) then return 'off'; end if;
  if p_price is null or p_price <= 0 or p_price >= 100000 or char_length(sk) = 0 or char_length(pk) = 0 or char_length(pn) = 0 or char_length(cur) <> 3 then return 'invalid'; end if;
  if p_sale then
    pk := left(pk, 192) || '|sale';
    pn := left(pn, 150) || ' (sale)';
  end if;
  me := public._price_contributor_of(auth.uid());
  select count(*) into today_n from public.shared_prices where contributor = me and source = 'shelf' and created_at > now() - interval '1 day';
  if today_n >= 40 then return 'limit'; end if;
  if not p_force then
    select percentile_cont(0.5) within group (order by price), count(*) into med, cnt
      from public.shared_prices
     where product_key = pk and currency = cur and contributor <> me and month >= (date_trunc('month', current_date) - interval '2 months')::date;
    if cnt >= 3 and med > 0 and (p_price > med * 3 or p_price < med / 3) then return 'check'; end if;
  end if;
  ctry := coalesce(nullif(upper(left(p_country, 2)), ''), public._country_of_currency(cur));
  insert into public.shared_prices (contributor, store_key, store_name, product_key, product_name, size_label, currency, price, month, country, source, created_at)
  values (me, sk, left(btrim(p_store_name), 120), pk, pn, nullif(left(btrim(p_size), 40), ''), cur, p_price, m, ctry, 'shelf', now())
  on conflict (contributor, store_key, product_key, month)
  do update set price = excluded.price, store_name = excluded.store_name, product_name = excluded.product_name, country = excluded.country, source = 'shelf', created_at = now();
  insert into public.price_share_seen (contributor, pair) values (me, encode(sha256(convert_to(sk || '|' || pk, 'UTF8')), 'hex'))
  on conflict do nothing;
  get diagnostics added = row_count;
  if added > 0 then
    update public.profiles
       set shared_total = shared_total + added,
           badge_best = greatest(badge_best, public._badge_level(shared_total + added))
     where id = auth.uid();
  end if;
  if ctry is not null then perform public._note_countries(auth.uid(), array[ctry]); end if;
  return 'ok';
end $$;

-- What you added at one shop today, with how many shoppers have now seen about that price
create or replace function public.my_shelf_prices(p_store_key text)
returns table (product_key text, product_name text, size_label text, currency text, price numeric, reporters integer)
language sql stable security definer set search_path = public as $$
  select s.product_key, s.product_name, s.size_label, s.currency, s.price,
         (select count(distinct o.contributor)::integer from public.shared_prices o
           where o.product_key = s.product_key and o.store_key = s.store_key and o.currency = s.currency
             and o.month >= (date_trunc('month', current_date) - interval '2 months')::date
             and o.price between s.price * 0.95 and s.price * 1.05)
  from public.shared_prices s
  where s.contributor = public._price_contributor_of(auth.uid()) and s.source = 'shelf'
    and s.store_key = left(lower(btrim(p_store_key)), 120) and s.created_at >= date_trunc('day', now())
  order by s.created_at desc
  limit 50
$$;

create or replace function public.undo_shelf_price(p_store_key text, p_product_key text) returns integer
language plpgsql security definer set search_path = public as $$
declare n integer;
begin
  if auth.uid() is null then raise exception 'Sign in first'; end if;
  delete from public.shared_prices
   where contributor = public._price_contributor_of(auth.uid()) and source = 'shelf'
     and store_key = left(lower(btrim(p_store_key)), 120) and product_key = left(lower(btrim(p_product_key)), 200)
     and month = date_trunc('month', current_date)::date;
  get diagnostics n = row_count;
  return n;
end $$;

revoke all on function public.share_shelf_price(text, text, text, text, text, numeric, text, text, boolean, boolean), public.my_shelf_prices(text), public.undo_shelf_price(text, text) from public, anon;
grant execute on function public.share_shelf_price(text, text, text, text, text, numeric, text, text, boolean, boolean), public.my_shelf_prices(text), public.undo_shelf_price(text, text) to authenticated;

notify pgrst, 'reload schema';
