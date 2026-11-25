-- Migration: prices an admin uploads are Confirmed right away, like the Do it and Super Food online lists.
-- Run in the Supabase SQL Editor (safe to run more than once). Needs migration_country.sql and migration_community_limit.sql first.
--  * shared_prices.trusted marks a price that came from an admin upload (the Community Prices Import). The admin checked it, so it does not
--    wait for 3 shoppers. Prices from the app are never trusted: they still need 3 shoppers who paid about the same.
--  * A trusted price is Confirmed when it is within 5% of the middle price of that shop, like the 3-shopper rule.
--  * Uploads made before this migration are marked too (found through the audit log).

alter table public.shared_prices add column if not exists trusted boolean not null default false;

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
      insert into public.shared_prices (contributor, store_key, store_name, product_key, product_name, size_label, currency, price, month, country, trusted)
      values (me, left(lower(r->>'store_key'), 120), left(r->>'store_name', 120), left(lower(r->>'product_key'), 200), left(r->>'product_name', 160),
              nullif(left(r->>'size_label', 40), ''), upper(left(r->>'currency', 3)), (r->>'price')::numeric, m, ctry, true)
      on conflict (contributor, store_key, product_key, month) do nothing;
      n := n + 1;
    exception when others then
      null; -- a bad row is skipped
    end;
  end loop;
  return n;
end $$;
revoke all on function public.import_prices(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.import_prices(uuid, jsonb) to service_role;

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
         (count(distinct u.contributor) filter (where u.price between sh.gm * 0.95 and sh.gm * 1.05) >= 3
          or coalesce(bool_or(u.trusted) filter (where u.price between sh.gm * 0.95 and sh.gm * 1.05), false))
  from usable u join shop sh on sh.product_key = u.product_key and sh.currency = u.currency and sh.store_key = u.store_key
  group by u.product_key, u.currency, u.store_key, sh.gm
  order by max(u.product_name), 6
  limit 1500
$$;
revoke all on function public.community_search(text, text[], text) from public, anon;
grant execute on function public.community_search(text, text[], text) to authenticated;


-- Earlier uploads: the upload id is in the audit log, and the one-way id is made from it the same way import_prices does
update public.shared_prices s set trusted = true
where not s.trusted and s.contributor in (
  select encode(sha256(convert_to('import:' || a.entity_id || (select salt from public.price_share_secret where id = 1), 'UTF8')), 'hex')
  from public.audit_logs a where a.action = 'community_prices.imported' and a.entity_id is not null
);

notify pgrst, 'reload schema';
