-- Community badges: a level for sharing prices (Helper 1, Scout 50, Guardian 200, Champion 500, Legend 1000).
-- Run once in the Supabase SQL Editor (safe to run more than once). Needs migration_shared_prices.sql first.
--
-- Private by design: only the person sees their own badge. No leaderboard, nothing is shown to others.
--  * shared_total counts one price per product and store, for life (sending a newer price for the same item does not count again,
--    and the count does not drop when old prices expire).
--  * badge_best is the highest level reached. It never goes down: "Delete what I shared" restarts the count at 0 but the earned badges stay.
--  * price_share_seen remembers only a one-way hash of the contributor and of "store + product", so a price is counted once. Nobody can read it.

alter table public.profiles add column if not exists shared_total integer not null default 0;
alter table public.profiles add column if not exists badge_best smallint not null default 0;
alter table public.profiles add column if not exists badge_seen smallint not null default 0;
alter table public.profiles add column if not exists badge_pushed smallint not null default 0;

create table if not exists public.price_share_seen (
  contributor text not null,
  pair text not null,
  primary key (contributor, pair)
);
alter table public.price_share_seen enable row level security;
revoke all on table public.price_share_seen from anon, authenticated;

-- 0 = no badge yet, 1 Helper, 2 Scout, 3 Guardian, 4 Champion, 5 Legend
create or replace function public._badge_level(total integer) returns smallint
language sql immutable as $$
  select (case when total >= 1000 then 5 when total >= 500 then 4 when total >= 200 then 3 when total >= 50 then 2 when total >= 1 then 1 else 0 end)::smallint
$$;

-- share_prices now also counts each new product + store once
create or replace function public.share_prices(rows jsonb) returns integer
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
begin
  if auth.uid() is null then raise exception 'Sign in first'; end if;
  if not coalesce((select share_prices from public.profiles where id = auth.uid()), false) then return 0; end if;
  if jsonb_typeof(rows) <> 'array' or jsonb_array_length(rows) > 300 then raise exception 'Too many rows'; end if;
  me := public._price_contributor_of(auth.uid());
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
  return n;
end $$;

-- Delete what I shared: the shared prices go and the count restarts at 0. Earned badges (badge_best) stay.
create or replace function public.unshare_my_prices() returns integer
language plpgsql security definer set search_path = public as $$
declare n integer; me text;
begin
  if auth.uid() is null then raise exception 'Sign in first'; end if;
  me := public._price_contributor_of(auth.uid());
  delete from public.shared_prices where contributor = me;
  get diagnostics n = row_count;
  delete from public.price_share_seen where contributor = me;
  update public.profiles set shared_total = 0 where id = auth.uid();
  return n;
end $$;

create or replace function public.unshare_prices_of(uid uuid) returns integer
language plpgsql security definer set search_path = public as $$
declare n integer; me text;
begin
  me := public._price_contributor_of(uid);
  delete from public.shared_prices where contributor = me;
  get diagnostics n = row_count;
  delete from public.price_share_seen where contributor = me;
  return n;
end $$;
revoke all on function public.unshare_prices_of(uuid) from public, anon, authenticated;
grant execute on function public.unshare_prices_of(uuid) to service_role;

-- My badge: how many prices counted, the level I reached, and whether the level-up was already shown
create or replace function public.my_badge() returns table (total integer, level smallint, best smallint, seen smallint)
language sql stable security definer set search_path = public as $$
  select p.shared_total, public._badge_level(p.shared_total), p.badge_best, p.badge_seen from public.profiles p where p.id = auth.uid()
$$;

-- The level-up message was shown
create or replace function public.ack_badge() returns void
language sql security definer set search_path = public as $$
  update public.profiles set badge_seen = badge_best where id = auth.uid()
$$;

-- Phone alert bookkeeping (the server sends one alert per new level)
create or replace function public.claim_badge_alert() returns smallint
language plpgsql security definer set search_path = public as $$
declare b smallint; pushed smallint;
begin
  select badge_best, badge_pushed into b, pushed from public.profiles where id = auth.uid();
  if b is null or b <= coalesce(pushed, 0) then return 0; end if;
  update public.profiles set badge_pushed = b where id = auth.uid();
  return b;
end $$;

revoke all on function public.share_prices(jsonb), public.unshare_my_prices(), public.my_badge(), public.ack_badge(), public.claim_badge_alert() from public, anon;
grant execute on function public.share_prices(jsonb), public.unshare_my_prices(), public.my_badge(), public.ack_badge(), public.claim_badge_alert() to authenticated;

notify pgrst, 'reload schema';
