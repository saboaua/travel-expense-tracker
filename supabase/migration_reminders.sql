-- Migration: Reminders (Personal > "Reminders"). Run in the Supabase SQL Editor (safe to run more than once).
-- A reminder has a title, notes, a time, a repeat, an alert, a colour, an icon and photos. Pro people can share one with another person.

create table if not exists public.reminders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  title text not null check (char_length(title) between 1 and 120),
  notes text check (notes is null or char_length(notes) <= 2000),
  due_at timestamptz not null,
  repeat text not null default 'none' check (repeat in ('none','daily','weekly','monthly','yearly')),
  repeat_days smallint[],
  tz text,
  alert text not null default 'at' check (alert in ('at','hour','day')),
  color text not null default 'blue' check (char_length(color) <= 20),
  icon text not null default 'bell' check (char_length(icon) <= 30),
  done_at timestamptz,
  snoozed_until timestamptz,
  last_alerted_for timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists reminders_user_due on public.reminders (user_id, due_at);
-- Weekly on chosen days (0 = Sunday ... 6 = Saturday) and the time zone those days count in. Added after the first release.
alter table public.reminders add column if not exists repeat_days smallint[];
alter table public.reminders add column if not exists tz text;
alter table public.reminders enable row level security;

create table if not exists public.reminder_photos (
  id uuid primary key default gen_random_uuid(),
  reminder_id uuid not null references public.reminders(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  file_path text not null check (char_length(file_path) <= 300),
  created_at timestamptz not null default now()
);
create index if not exists reminder_photos_reminder on public.reminder_photos (reminder_id);
alter table public.reminder_photos enable row level security;

create table if not exists public.reminder_shares (
  reminder_id uuid not null references public.reminders(id) on delete cascade,
  owner_id uuid not null references public.profiles(id) on delete cascade,
  shared_with uuid not null references public.profiles(id) on delete cascade,
  can_complete boolean not null default true,
  created_at timestamptz not null default now(),
  primary key (reminder_id, shared_with)
);
alter table public.reminder_shares enable row level security;

-- Who may see a reminder: the owner, or a person it is shared with.
create or replace function public.can_see_reminder(rid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.reminders r where r.id = rid and r.user_id = auth.uid())
      or exists (select 1 from public.reminder_shares s where s.reminder_id = rid and s.shared_with = auth.uid());
$$;
revoke all on function public.can_see_reminder(uuid) from public, anon;
grant execute on function public.can_see_reminder(uuid) to authenticated;

drop policy if exists "Reminders read" on public.reminders;
create policy "Reminders read" on public.reminders for select to authenticated using (public.can_see_reminder(id));
drop policy if exists "Reminders add" on public.reminders;
create policy "Reminders add" on public.reminders for insert to authenticated with check (auth.uid() = user_id);
drop policy if exists "Reminders change" on public.reminders;
create policy "Reminders change" on public.reminders for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists "Reminders delete" on public.reminders;
create policy "Reminders delete" on public.reminders for delete to authenticated using (auth.uid() = user_id);

drop policy if exists "Reminder photos read" on public.reminder_photos;
create policy "Reminder photos read" on public.reminder_photos for select to authenticated using (public.can_see_reminder(reminder_id));
drop policy if exists "Reminder photos add" on public.reminder_photos;
create policy "Reminder photos add" on public.reminder_photos for insert to authenticated
  with check (auth.uid() = user_id and exists (select 1 from public.reminders r where r.id = reminder_id and r.user_id = auth.uid()));
drop policy if exists "Reminder photos delete" on public.reminder_photos;
create policy "Reminder photos delete" on public.reminder_photos for delete to authenticated using (auth.uid() = user_id);

drop policy if exists "Reminder shares read" on public.reminder_shares;
create policy "Reminder shares read" on public.reminder_shares for select to authenticated using (auth.uid() = owner_id or auth.uid() = shared_with);
drop policy if exists "Reminder shares delete" on public.reminder_shares;
create policy "Reminder shares delete" on public.reminder_shares for delete to authenticated using (auth.uid() = owner_id or auth.uid() = shared_with);

-- Mark done. The owner or a person with "can mark done". A repeating reminder moves to its next time instead of closing.
create or replace function public.complete_reminder(rid uuid) returns timestamptz
language plpgsql security definer set search_path = public as $$
declare r public.reminders; nxt timestamptz; loc timestamp;
begin
  select * into r from public.reminders where id = rid;
  if not found then raise exception 'not_found'; end if;
  if r.user_id <> auth.uid() and not exists (select 1 from public.reminder_shares s where s.reminder_id = rid and s.shared_with = auth.uid() and s.can_complete) then
    raise exception 'not_allowed';
  end if;
  if r.repeat = 'none' then
    update public.reminders set done_at = now(), snoozed_until = null where id = rid;
    return null;
  end if;
  if r.repeat = 'weekly' and r.repeat_days is not null and cardinality(r.repeat_days) > 0 then
    -- chosen weekdays: step one day at a time, in the person's own time zone, to the next chosen day that is still ahead
    loc := r.due_at at time zone coalesce(r.tz, 'UTC');
    loop
      loc := loc + interval '1 day';
      exit when extract(dow from loc)::smallint = any (r.repeat_days) and (loc at time zone coalesce(r.tz, 'UTC')) > now();
    end loop;
    nxt := loc at time zone coalesce(r.tz, 'UTC');
  else
    nxt := r.due_at;
    while nxt <= now() loop
      nxt := case r.repeat when 'daily' then nxt + interval '1 day' when 'weekly' then nxt + interval '7 days'
                           when 'monthly' then nxt + interval '1 month' else nxt + interval '1 year' end;
    end loop;
  end if;
  update public.reminders set due_at = nxt, snoozed_until = null, done_at = null, last_alerted_for = null where id = rid;
  return nxt;
end $$;
revoke all on function public.complete_reminder(uuid) from public, anon;
grant execute on function public.complete_reminder(uuid) to authenticated;

-- Share with a person by email (Pro is checked by the app). Returns 'ok', 'not_found' or 'self'.
create or replace function public.share_reminder(rid uuid, person_email text, may_complete boolean) returns text
language plpgsql security definer set search_path = public as $$
declare uid uuid;
begin
  if not exists (select 1 from public.reminders where id = rid and user_id = auth.uid()) then raise exception 'not_allowed'; end if;
  select id into uid from auth.users where lower(email) = lower(trim(person_email)) limit 1;
  if uid is null then return 'not_found'; end if;
  if uid = auth.uid() then return 'self'; end if;
  insert into public.reminder_shares (reminder_id, owner_id, shared_with, can_complete) values (rid, auth.uid(), uid, may_complete)
    on conflict (reminder_id, shared_with) do update set can_complete = excluded.can_complete;
  return 'ok';
end $$;
revoke all on function public.share_reminder(uuid, text, boolean) from public, anon;
grant execute on function public.share_reminder(uuid, text, boolean) to authenticated;

-- Photos live in a private bucket, one folder per person.
insert into storage.buckets (id, name, public) values ('reminder-photos', 'reminder-photos', false) on conflict (id) do nothing;
drop policy if exists "Reminder photo files add" on storage.objects;
create policy "Reminder photo files add" on storage.objects for insert to authenticated
  with check (bucket_id = 'reminder-photos' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists "Reminder photo files read" on storage.objects;
create policy "Reminder photo files read" on storage.objects for select to authenticated
  using (bucket_id = 'reminder-photos' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists "Reminder photo files delete" on storage.objects;
create policy "Reminder photo files delete" on storage.objects for delete to authenticated
  using (bucket_id = 'reminder-photos' and (storage.foldername(name))[1] = auth.uid()::text);

notify pgrst, 'reload schema';
