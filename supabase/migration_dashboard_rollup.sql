-- One row per receipt and category, added up in the database, for the Personal dashboard's "where grocery money goes".
-- Before this, the dashboard downloaded every receipt line (and the phone cut it off at 1,000 lines). Safe to run again.
-- Reads only your own lines (row security still applies). Until this runs, the dashboard keeps working the old way.

create or replace function public.grocery_receipt_categories()
returns table (receipt_id uuid, category text, line_total numeric)
language sql stable security invoker set search_path = public as $$
  select i.receipt_id, coalesce(nullif(trim(i.category), ''), 'Other') as category, sum(i.line_total) as line_total
  from public.grocery_items i
  where i.user_id = auth.uid() and i.line_total > 0
  group by 1, 2
  order by 1, 2;
$$;

revoke all on function public.grocery_receipt_categories() from public, anon;
grant execute on function public.grocery_receipt_categories() to authenticated;

notify pgrst, 'reload schema';
