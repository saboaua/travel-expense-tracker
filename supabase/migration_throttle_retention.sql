-- Sign-in throttling counters + log retention. Safe to run more than once.
-- Run in the Supabase SQL Editor.

create table if not exists public.auth_throttle (
  key text primary key,
  count integer not null default 0,
  window_start timestamptz not null default now(),
  locked_until timestamptz
);
alter table public.auth_throttle enable row level security;   -- no policies: only the service role can use it
revoke all on public.auth_throttle from anon, authenticated;

-- Current counters for a set of keys (expired windows count as zero)
create or replace function public.throttle_status(p_keys text[], p_window_seconds int)
returns table(key text, count int, locked_until timestamptz)
language sql security definer set search_path = public as $$
  select t.key,
         case when t.window_start + make_interval(secs => p_window_seconds) > now() then t.count else 0 end,
         case when t.locked_until > now() then t.locked_until else null end
  from public.auth_throttle t
  where t.key = any(p_keys);
$$;

-- Counts one failure atomically; locks when the limit is reached (p_lock_seconds = 0 never locks)
create or replace function public.throttle_hit(p_key text, p_window_seconds int, p_limit int, p_lock_seconds int)
returns table(count int, locked_until timestamptz)
language plpgsql security definer set search_path = public as $$
begin
  return query
  insert into public.auth_throttle as t (key, count, window_start, locked_until)
  values (p_key, 1, now(),
          case when p_lock_seconds > 0 and 1 >= p_limit then now() + make_interval(secs => p_lock_seconds) end)
  on conflict (key) do update set
    count = case when t.window_start + make_interval(secs => p_window_seconds) <= now() then 1 else t.count + 1 end,
    window_start = case when t.window_start + make_interval(secs => p_window_seconds) <= now() then now() else t.window_start end,
    locked_until = case
      when p_lock_seconds > 0
       and (case when t.window_start + make_interval(secs => p_window_seconds) <= now() then 1 else t.count + 1 end) >= p_limit
       and (t.locked_until is null or t.locked_until <= now())
        then now() + make_interval(secs => p_lock_seconds)
      when t.window_start + make_interval(secs => p_window_seconds) <= now() then null
      else t.locked_until end
  returning t.count, t.locked_until;
end $$;

create or replace function public.throttle_reset(p_key text)
returns void language sql security definer set search_path = public as $$
  delete from public.auth_throttle where key = p_key;
$$;

revoke all on function public.throttle_status(text[], int) from public, anon, authenticated;
revoke all on function public.throttle_hit(text, int, int, int) from public, anon, authenticated;
revoke all on function public.throttle_reset(text) from public, anon, authenticated;
grant execute on function public.throttle_status(text[], int) to service_role;
grant execute on function public.throttle_hit(text, int, int, int) to service_role;
grant execute on function public.throttle_reset(text) to service_role;

-- Retention: keeps the log tables (and counters) from growing without limit
create or replace function public.purge_old_logs(p_security_days int default 90, p_audit_days int default 365)
returns void language plpgsql security definer set search_path = public as $$
begin
  delete from public.security_events
   where created_at < now() - make_interval(days => p_security_days) and severity <> 'critical';
  delete from public.security_events
   where created_at < now() - make_interval(days => p_security_days * 4);
  if to_regclass('public.audit_logs') is not null then
    execute format('delete from public.audit_logs where created_at < now() - make_interval(days => %s)', p_audit_days);
  end if;
  delete from public.auth_throttle
   where window_start < now() - interval '1 day' and (locked_until is null or locked_until < now());
end $$;
revoke all on function public.purge_old_logs(int, int) from public, anon, authenticated;
grant execute on function public.purge_old_logs(int, int) to service_role;

-- Daily schedule when pg_cron is available (Database > Extensions > pg_cron); otherwise just a notice
do $$
begin
  create extension if not exists pg_cron;
  perform cron.unschedule(jobid) from cron.job where jobname = 'purge-old-logs';
  perform cron.schedule('purge-old-logs', '17 3 * * *', 'select public.purge_old_logs()');
exception when others then
  raise notice 'pg_cron not available (%). Run select public.purge_old_logs(); now and then instead.', sqlerrm;
end $$;
