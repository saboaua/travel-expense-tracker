-- Security hardening. Run in the Supabase SQL Editor (safe to run more than once).
--
-- 1. A signed-in user could change their own profiles.role (the "update own profile" policy allows any column).
--    A trigger now blocks role changes unless they come from the service role / SQL editor.
-- 2. audit_logs / security_events accepted inserts from anyone holding the public anon key
--    ("with check (true)" applied to every role). Only the service role (which bypasses RLS) writes them now.

-- 1) Protect privileged columns on profiles
create or replace function public.protect_profile_privileges()
returns trigger
language plpgsql
as $$
begin
  -- current_user is the role PostgREST switched to for this request. The service role and the SQL editor
  -- are not 'authenticated'/'anon', so the admin API and your own SQL keep working.
  if current_user in ('authenticated', 'anon') then
    if tg_op = 'INSERT' then
      new.role := 'user';
    elsif new.role is distinct from old.role then
      raise exception 'Changing a role is not allowed' using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_protect_privileges on public.profiles;
create trigger profiles_protect_privileges
  before insert or update on public.profiles
  for each row execute function public.protect_profile_privileges();

-- 2) Logs are written by the server only
drop policy if exists "Service can insert audit logs" on public.audit_logs;
drop policy if exists "Service can insert security events" on public.security_events;

notify pgrst, 'reload schema';
