-- Migration: a shared price keeps its exact time for 2 days only. After that the time is wiped and only the month remains.
-- Run in the Supabase SQL Editor (safe to run more than once), after migration_shelf_prices.sql.
-- The time is needed for two days at most: the limit of 40 prices a day and "Undo". Community prices from receipts never get a time.

alter table public.shared_prices alter column created_at drop not null;
alter table public.shared_prices alter column created_at drop default;

-- Right now: receipt prices have no time, shelf prices keep theirs for 2 days
update public.shared_prices set created_at = null where source <> 'shelf' and created_at is not null;
update public.shared_prices set created_at = null where created_at is not null and created_at < now() - interval '2 days';

-- The daily job wipes the rest. Only the server (service role) may run it.
create or replace function public.wipe_share_times() returns integer
language plpgsql security definer set search_path = public as $$
declare n integer;
begin
  update public.shared_prices set created_at = null where created_at is not null and created_at < now() - interval '2 days';
  get diagnostics n = row_count;
  return n;
end $$;
revoke all on function public.wipe_share_times() from public, anon, authenticated;
grant execute on function public.wipe_share_times() to service_role;

notify pgrst, 'reload schema';
