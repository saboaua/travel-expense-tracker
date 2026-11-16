-- Community prices, one rule for everyone. Run once in the Supabase SQL Editor (safe to run more than once).
-- Needs migration_shared_prices.sql first.
--
--  * A price shows as soon as one shopper has it. "reporters" is how many different shoppers paid about that price.
--  * It is Confirmed when 3 or more shoppers paid about the same price (within 5% of the middle price).
--  * Prices of the current month and the 2 months before it show (3 months). Older ones are not shown.
--  * Prices far from the usual for the product (under 0.4x or over 2.5x the middle price) are still ignored.
--  * Admin Excel uploads add rows as one more shopper per upload (a one-way id made from the upload, never from a person).
--    An upload only adds. Nothing already there is changed or deleted.
--  * The same file cannot be imported twice (price_imports remembers a fingerprint of each file).

create table if not exists public.price_imports (
  id uuid primary key default gen_random_uuid(),
  file_hash text not null unique,
  file_name text,
  total_rows integer not null default 0,
  added integer not null default 0,
  seen_before integer not null default 0,
  created_by uuid,
  created_at timestamptz not null default now()
);
alter table public.price_imports enable row level security;
revoke all on table public.price_imports from anon, authenticated;

-- Add rows of { store_key, store_name, product_key, product_name, size_label, currency, price } as ONE shopper (the batch).
-- The server calls this with the service role after it has checked the admin. Returns how many rows were stored.
create or replace function public.import_prices(batch uuid, rows jsonb) returns integer
language plpgsql security definer set search_path = public as $$
declare
  me text;
  n integer := 0;
  r jsonb;
  m date := date_trunc('month', current_date)::date;
begin
  if jsonb_typeof(rows) <> 'array' or jsonb_array_length(rows) > 1000 then raise exception 'Too many rows'; end if;
  me := encode(sha256(convert_to('import:' || batch::text || (select salt from public.price_share_secret where id = 1), 'UTF8')), 'hex');
  for r in select * from jsonb_array_elements(rows) loop
    begin
      insert into public.shared_prices (contributor, store_key, store_name, product_key, product_name, size_label, currency, price, month)
      values (me, left(lower(r->>'store_key'), 120), left(r->>'store_name', 120), left(lower(r->>'product_key'), 200), left(r->>'product_name', 160),
              nullif(left(r->>'size_label', 40), ''), upper(left(r->>'currency', 3)), (r->>'price')::numeric, m)
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

-- Community prices for products matching a search (at least 2 letters), or for exact product keys.
drop function if exists public.community_search(text, text[]);
create function public.community_search(q text default null, keys text[] default null)
returns table (product_key text, product_name text, size_label text, currency text, store_name text, price numeric, reporters integer, last_month date, confirmed boolean)
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
revoke all on function public.community_search(text, text[]) from public, anon;
grant execute on function public.community_search(text, text[]) to authenticated;

notify pgrst, 'reload schema';
