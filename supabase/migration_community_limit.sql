-- Community prices: allow more rows per search. The search used to stop at 300 rows (alphabetical), so a long list of products lost the
-- prices of everything late in the alphabet. The app now also asks in small batches. Safe to run more than once. Needs migration_country.sql first.
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
  limit 1500
$$;
revoke all on function public.community_search(text, text[], text) from public, anon;
grant execute on function public.community_search(text, text[], text) to authenticated;

notify pgrst, 'reload schema';
