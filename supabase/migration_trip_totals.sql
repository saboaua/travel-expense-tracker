-- How many expenses each of your trips has and what they add up to in USD, counted in the database.
-- The dashboard used to download every expense of every trip just to add them up. Safe to run again.
-- Reads only your own trips (row security still applies). Until this runs, the dashboard keeps working the old way.
-- USD amount: the saved USD value when there is one, otherwise the amount itself when it is in USD, otherwise nothing.

create or replace function public.trip_expense_totals()
returns table (trip_id uuid, expense_count integer, total_usd numeric)
language sql stable security invoker set search_path = public as $$
  select e.trip_id,
         count(*)::integer as expense_count,
         coalesce(sum(case when e.amount_usd is not null then e.amount_usd
                           when e.currency is null or e.currency = '' or e.currency = 'USD' then e.amount
                           else 0 end), 0) as total_usd
  from public.expenses e
  join public.trips t on t.id = e.trip_id
  where t.user_id = auth.uid()
  group by e.trip_id;
$$;

revoke all on function public.trip_expense_totals() from public, anon;
grant execute on function public.trip_expense_totals() to authenticated;

notify pgrst, 'reload schema';
