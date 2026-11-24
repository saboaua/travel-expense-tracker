-- Share reminders with your partners (the same people as for loyalty cards and trips).
-- Run in the Supabase SQL Editor (safe to run more than once). Needs migration_reminders.sql and migration_sharing.sql first.
--
-- A reminder is shared with a partner by switching that partner on. The existing reminder_shares table still decides who can
-- see and complete a reminder; these functions only fill it from an ACTIVE partnership, so a partner who is removed
-- loses every shared reminder at the same moment (see the trigger at the end).

create or replace function public.share_reminder_partner(rid uuid, pid uuid, may_complete boolean) returns text
language plpgsql security definer set search_path = public as $$
declare uid uuid := public.sharing_gate(); p public.partnerships; other uuid;
begin
  if not exists (select 1 from public.reminders where id = rid and user_id = uid) then raise exception 'not_allowed'; end if;
  select * into p from public.partnerships where id = pid and status = 'active' and (requester_id = uid or invitee_id = uid);
  if not found then return 'not_found'; end if;
  other := public.sharing_other(p, uid);
  if other is null or other = uid then return 'not_found'; end if;
  insert into public.reminder_shares (reminder_id, owner_id, shared_with, can_complete) values (rid, uid, other, may_complete)
    on conflict (reminder_id, shared_with) do update set can_complete = excluded.can_complete;
  return 'ok';
end $$;

create or replace function public.unshare_reminder_partner(rid uuid, pid uuid) returns void
language plpgsql security definer set search_path = public as $$
declare uid uuid := public.sharing_gate(); p public.partnerships; other uuid;
begin
  select * into p from public.partnerships where id = pid and (requester_id = uid or invitee_id = uid);
  if not found then return; end if;
  other := public.sharing_other(p, uid);
  delete from public.reminder_shares where reminder_id = rid and owner_id = uid and shared_with = other;
end $$;

-- Who I share each of my reminders with (one row per reminder and active partner)
create or replace function public.my_reminder_partner_shares() returns table (reminder_id uuid, partnership_id uuid, can_complete boolean)
language plpgsql stable security definer set search_path = public as $$
declare uid uuid := public.sharing_gate();
begin
  return query
    select s.reminder_id, p.id, s.can_complete
    from public.reminder_shares s
    join public.partnerships p on p.status = 'active' and (p.requester_id = uid or p.invitee_id = uid) and public.sharing_other(p, uid) = s.shared_with
    where s.owner_id = uid;
end $$;

-- Who sent me each reminder that was shared with me (their first name, as partners see it)
create or replace function public.reminders_shared_with_me() returns table (reminder_id uuid, owner_name text)
language plpgsql stable security definer set search_path = public as $$
declare uid uuid := public.sharing_gate();
begin
  return query
    select s.reminder_id, public.sharing_name(s.owner_id)
    from public.reminder_shares s
    where s.shared_with = uid;
end $$;

revoke all on function public.share_reminder_partner(uuid, uuid, boolean), public.unshare_reminder_partner(uuid, uuid), public.my_reminder_partner_shares(), public.reminders_shared_with_me() from public, anon;
grant execute on function public.share_reminder_partner(uuid, uuid, boolean), public.unshare_reminder_partner(uuid, uuid), public.my_reminder_partner_shares(), public.reminders_shared_with_me() to authenticated;

-- When a partnership ends (or is declined or blocked), the reminders shared through it stop being shared
create or replace function public.partnership_ended_reminders() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.status in ('ended', 'declined', 'blocked') and old.status is distinct from new.status and new.invitee_id is not null then
    delete from public.reminder_shares
     where (owner_id = new.requester_id and shared_with = new.invitee_id) or (owner_id = new.invitee_id and shared_with = new.requester_id);
  end if;
  return new;
end $$;
drop trigger if exists partnership_ended_reminders on public.partnerships;
create trigger partnership_ended_reminders after update of status on public.partnerships for each row execute function public.partnership_ended_reminders();

notify pgrst, 'reload schema';
