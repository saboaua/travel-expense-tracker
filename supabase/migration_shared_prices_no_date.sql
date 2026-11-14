-- Community prices: stop sending any date from the phone. Safe to run whether or not migration_shared_prices.sql was run before
-- (run that one first if it has not been run yet). The database stamps the month a price arrived, so old prices can still expire.
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

