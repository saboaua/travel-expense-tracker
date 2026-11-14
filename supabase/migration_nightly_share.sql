-- Community prices: shared once a night by the server, so a receipt can be corrected first, and a later correction or delete is picked up.
-- Run once in the Supabase SQL Editor (safe to run more than once). Needs migration_shared_prices.sql and migration_badges.sql first.
--
-- Each night the server reads the latest prices of people who turned sharing on and calls share_prices_for with the full list.
-- That replaces the person's shared prices for the current month: a price that was corrected is overwritten, and a price that is no
-- longer in their receipts or price checks is removed. Only store, item name, size, currency and price are written (no names, receipts,
-- dates or totals). Only the server (service role) can call it.

alter table public.profiles add column if not exists share_last_at timestamptz;
alter table public.profiles add column if not exists share_last_count integer;
alter table public.profiles add column if not exists share_last_error boolean not null default false;

create or replace function public.share_prices_for(uid uuid, rows jsonb, replace_month boolean default true) returns integer
language plpgsql security definer set search_path = public as $$
declare
  me text;
  n integer := 0;
  fresh integer := 0;
  r jsonb;
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
      sk := left(lower(r->>'store_key'), 120);
      pk := left(lower(r->>'product_key'), 200);
      insert into public.shared_prices (contributor, store_key, store_name, product_key, product_name, size_label, currency, price, month)
      values (me, sk, left(r->>'store_name', 120), pk, left(r->>'product_name', 160),
              nullif(left(r->>'size_label', 40), ''), upper(left(r->>'currency', 3)), (r->>'price')::numeric, m)
      on conflict (contributor, store_key, product_key, month)
      do update set price = excluded.price, store_name = excluded.store_name, product_name = excluded.product_name;
      n := n + 1;
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
  return n;
end $$;
revoke all on function public.share_prices_for(uuid, jsonb, boolean) from public, anon, authenticated;
grant execute on function public.share_prices_for(uuid, jsonb, boolean) to service_role;

-- A night that failed for this person (the card says it will try again)
create or replace function public.share_failed_for(uid uuid) returns void
language sql security definer set search_path = public as $$
  update public.profiles set share_last_error = true where id = uid
$$;
revoke all on function public.share_failed_for(uuid) from public, anon, authenticated;
grant execute on function public.share_failed_for(uuid) to service_role;

-- The badge alert for the server: returns the level that was not announced yet (0 when none)
create or replace function public.claim_badge_alert_for(uid uuid) returns smallint
language plpgsql security definer set search_path = public as $$
declare b smallint; pushed smallint;
begin
  select badge_best, badge_pushed into b, pushed from public.profiles where id = uid;
  if b is null or b <= coalesce(pushed, 0) then return 0; end if;
  update public.profiles set badge_pushed = b where id = uid;
  return b;
end $$;
revoke all on function public.claim_badge_alert_for(uuid) from public, anon, authenticated;
grant execute on function public.claim_badge_alert_for(uuid) to service_role;


-- My badge numbers for the server (the alert text)
create or replace function public.my_badge_for(uid uuid) returns table (total integer, level smallint, best smallint, seen smallint)
language sql stable security definer set search_path = public as $$
  select p.shared_total, public._badge_level(p.shared_total), p.badge_best, p.badge_seen from public.profiles p where p.id = uid
$$;
revoke all on function public.my_badge_for(uuid) from public, anon, authenticated;
grant execute on function public.my_badge_for(uuid) to service_role;

notify pgrst, 'reload schema';
