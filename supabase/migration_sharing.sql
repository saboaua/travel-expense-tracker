-- Partner sharing, version 1: share loyalty cards (view only) and a trip's name, destination and dates.
-- Run in the Supabase SQL Editor (safe to run more than once). Needs migration_roles.sql, migration_loyalty.sql,
-- migration_personal.sql and migration_audit.sql first.
--
-- How it is kept safe:
--  * The three new tables have row level security ON and NO policies, and the app roles have no table rights at all.
--    The browser can only call the functions below. Nothing else can read or write them.
--  * Every function starts with sharing_gate(): you must be signed in, sharing must not be switched off for the whole
--    app (app_settings.sharing_disabled) and your role must have the "sharing" option (Admin > Roles).
--  * Nothing is shared unless the owner picks that one card or trip for that one approved partner (a row in "shares").
--  * Shared trips return four columns only (name, destination, start date, end date), written out in the function.
--    Expenses, receipts, notes and costs are never read.
--  * Failsafe: shared_loyalty_cards() and shared_trips() check their own result. If any row could not be justified by an
--    active partnership and a share row, they return nothing, write a "leak_blocked" security event and switch sharing
--    off for everyone until an admin switches it back on (app_settings.sharing_disabled = false).

alter table public.app_settings add column if not exists sharing_disabled boolean not null default false;

-- Who has turned sharing on (written only by set_sharing / respond_to_invite)
create table if not exists public.sharing_settings (
  user_id uuid primary key references auth.users(id) on delete cascade,
  enabled boolean not null default false,
  updated_at timestamptz not null default now()
);

create table if not exists public.partnerships (
  id uuid primary key default gen_random_uuid(),
  requester_id uuid not null references auth.users(id) on delete cascade,
  invitee_email text not null check (invitee_email = lower(invitee_email) and char_length(invitee_email) between 3 and 254),
  invitee_id uuid references auth.users(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'active', 'declined', 'ended', 'blocked')),
  created_at timestamptz not null default now(),
  responded_at timestamptz,
  expires_at timestamptz not null default (now() + interval '14 days')
);
create unique index if not exists partnerships_live_pair_idx on public.partnerships (requester_id, invitee_email) where status in ('pending', 'active');
create index if not exists partnerships_invitee_email_idx on public.partnerships (invitee_email);
create index if not exists partnerships_invitee_idx on public.partnerships (invitee_id);
create index if not exists partnerships_requester_idx on public.partnerships (requester_id, created_at desc);

create table if not exists public.shares (
  id uuid primary key default gen_random_uuid(),
  partnership_id uuid not null references public.partnerships(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade,
  kind text not null check (kind in ('loyalty_card', 'trip', 'personal_trip')),
  item_id uuid not null,
  created_at timestamptz not null default now(),
  unique (partnership_id, owner_id, kind, item_id)
);
create index if not exists shares_item_idx on public.shares (kind, item_id);

alter table public.sharing_settings enable row level security;
alter table public.partnerships enable row level security;
alter table public.shares enable row level security;
-- no policies on purpose: only the functions below (which run as the table owner) can touch these tables
revoke all on public.sharing_settings from anon, authenticated;
revoke all on public.partnerships from anon, authenticated;
revoke all on public.shares from anon, authenticated;

/* ---------------- small helpers (not callable from the browser) ---------------- */

create or replace function public.sharing_my_email()
returns text language sql stable security definer set search_path = public as $$
  select lower(email) from auth.users where id = auth.uid()
$$;

create or replace function public.sharing_name(p uuid)
returns text language sql stable security definer set search_path = public as $$
  select coalesce(nullif(trim(first_name), ''), nullif(split_part(email, '@', 1), ''), 'Someone') from public.profiles where id = p
$$;

create or replace function public.sharing_email_of(p uuid)
returns text language sql stable security definer set search_path = public as $$
  select lower(email) from auth.users where id = p
$$;

create or replace function public.sharing_log(p_type text, p_severity text, p_details jsonb)
returns void language plpgsql security definer set search_path = public as $$
begin
  insert into public.security_events (event_type, severity, user_id, details)
  values (p_type, p_severity, auth.uid(), coalesce(p_details, '{}'::jsonb));
exception when others then
  null; -- logging must never break the request
end;
$$;

-- True when this person may use sharing right now. Does not raise.
create or replace function public.sharing_available()
returns boolean language plpgsql stable security definer set search_path = public as $$
begin
  if auth.uid() is null then return false; end if;
  if coalesce((select sharing_disabled from public.app_settings where id = 1), false) then return false; end if;
  return public.has_permission('sharing');
end;
$$;

-- The first line of every sharing function.
create or replace function public.sharing_gate()
returns uuid language plpgsql stable security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'not_signed_in'; end if;
  if not public.sharing_available() then raise exception 'sharing_off'; end if;
  return auth.uid();
end;
$$;

create or replace function public.sharing_is_on(p uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select enabled from public.sharing_settings where user_id = p), false)
$$;

create or replace function public.sharing_active_count(p uuid)
returns integer language sql stable security definer set search_path = public as $$
  select count(*)::int from public.partnerships where status = 'active' and (requester_id = p or invitee_id = p)
$$;

-- The other person in a partnership (null when the caller is not part of it)
create or replace function public.sharing_other(p public.partnerships, me uuid)
returns uuid language sql immutable as $$
  select case when p.requester_id = me then p.invitee_id when p.invitee_id = me then p.requester_id else null end
$$;

/* ---------------- turning sharing on and off ---------------- */

create or replace function public.set_sharing(p_enabled boolean)
returns void language plpgsql security definer set search_path = public as $$
declare uid uuid := public.sharing_gate();
begin
  insert into public.sharing_settings (user_id, enabled) values (uid, coalesce(p_enabled, false))
  on conflict (user_id) do update set enabled = excluded.enabled, updated_at = now();
  if not coalesce(p_enabled, false) then
    delete from public.shares where partnership_id in (select id from public.partnerships where status in ('pending', 'active') and (requester_id = uid or invitee_id = uid));
    update public.partnerships set status = 'ended', responded_at = now()
      where status in ('pending', 'active') and (requester_id = uid or invitee_id = uid);
  end if;
  perform public.sharing_log(case when p_enabled then 'sharing_on' else 'sharing_off' end, 'info', '{}'::jsonb);
end;
$$;

/* ---------------- invite, answer, end ---------------- */

-- Always answers 'sent' for a well-formed email, whether or not the email has an account, so it cannot be used to find out
-- who uses the app. Errors only describe the sender's own situation (not enabled, limits, own email).
create or replace function public.invite_partner(p_email text)
returns text language plpgsql security definer set search_path = public as $$
declare
  uid uuid := public.sharing_gate();
  em text := lower(trim(coalesce(p_email, '')));
  mine text := public.sharing_my_email();
  target uuid;
begin
  if em !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' or char_length(em) > 254 then raise exception 'bad_email'; end if;
  if not public.sharing_is_on(uid) then raise exception 'enable_first'; end if;
  if em = mine then raise exception 'self_invite'; end if;

  update public.partnerships set status = 'ended' where requester_id = uid and status = 'pending' and expires_at < now();

  if public.sharing_active_count(uid) >= 4 then raise exception 'partner_limit'; end if;
  if (select count(*) from public.partnerships where requester_id = uid and status = 'pending') >= 10 then raise exception 'pending_limit'; end if;
  if (select count(*) from public.partnerships where requester_id = uid and created_at > now() - interval '24 hours') >= 5 then raise exception 'daily_limit'; end if;

  select id into target from auth.users where lower(email) = em limit 1;

  -- Quiet no-ops that still answer 'sent': already invited or paired, invited in the last 24 hours, blocked by them,
  -- or they already invited you (their invite is waiting on your bell).
  if exists (select 1 from public.partnerships where requester_id = uid and invitee_email = em
             and (status in ('pending', 'active', 'blocked') or created_at > now() - interval '24 hours')) then
    return 'sent';
  end if;
  if target is not null and exists (select 1 from public.partnerships where requester_id = target and invitee_email = mine and status in ('pending', 'active')) then
    return 'sent';
  end if;

  insert into public.partnerships (requester_id, invitee_email) values (uid, em);
  perform public.sharing_log('sharing_invite', 'info', jsonb_build_object('invitee', em));
  return 'sent';
end;
$$;

create or replace function public.respond_to_invite(p_id uuid, p_action text)
returns void language plpgsql security definer set search_path = public as $$
declare
  uid uuid := public.sharing_gate();
  row_ public.partnerships;
begin
  if p_action not in ('accept', 'decline', 'block') then raise exception 'bad_action'; end if;
  select * into row_ from public.partnerships
    where id = p_id and status = 'pending' and expires_at > now() and invitee_email = public.sharing_my_email() for update;
  if not found then raise exception 'not_found'; end if;

  if p_action = 'accept' then
    if public.sharing_active_count(uid) >= 4 or public.sharing_active_count(row_.requester_id) >= 4 then raise exception 'partner_limit'; end if;
    insert into public.sharing_settings (user_id, enabled) values (uid, true)
      on conflict (user_id) do update set enabled = true, updated_at = now();
    update public.partnerships set status = 'active', invitee_id = uid, responded_at = now() where id = p_id;
  else
    update public.partnerships set status = case p_action when 'block' then 'blocked' else 'declined' end,
      invitee_id = uid, responded_at = now() where id = p_id;
  end if;
  perform public.sharing_log('sharing_' || p_action, 'info', jsonb_build_object('partnership', p_id));
end;
$$;

-- Either side can end a pairing or cancel their own pending invite. Everything shared inside it goes with it.
create or replace function public.end_partnership(p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare uid uuid := public.sharing_gate();
begin
  perform 1 from public.partnerships
    where id = p_id and status in ('pending', 'active') and (requester_id = uid or invitee_id = uid) for update;
  if not found then raise exception 'not_found'; end if;
  delete from public.shares where partnership_id = p_id;
  update public.partnerships set status = 'ended', responded_at = now() where id = p_id;
  perform public.sharing_log('sharing_end', 'info', jsonb_build_object('partnership', p_id));
end;
$$;

/* ---------------- choosing what to share ---------------- */

create or replace function public.share_item(p_partnership uuid, p_kind text, p_item uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  uid uuid := public.sharing_gate();
  owned boolean := false;
  sid uuid;
begin
  perform 1 from public.partnerships where id = p_partnership and status = 'active' and (requester_id = uid or invitee_id = uid);
  if not found then raise exception 'not_found'; end if;

  if p_kind = 'loyalty_card' then
    owned := exists (select 1 from public.loyalty_cards where id = p_item and user_id = uid);
  elsif p_kind = 'trip' then
    owned := exists (select 1 from public.trips where id = p_item and user_id = uid);
  elsif p_kind = 'personal_trip' then
    owned := exists (select 1 from public.personal_projects where id = p_item and user_id = uid and kind = 'personal_trip');
  else
    raise exception 'bad_kind';
  end if;
  if not owned then raise exception 'not_found'; end if;

  insert into public.shares (partnership_id, owner_id, kind, item_id) values (p_partnership, uid, p_kind, p_item)
    on conflict (partnership_id, owner_id, kind, item_id) do nothing;
  select id into sid from public.shares where partnership_id = p_partnership and owner_id = uid and kind = p_kind and item_id = p_item;
  perform public.sharing_log('sharing_share', 'info', jsonb_build_object('kind', p_kind, 'item', p_item, 'partnership', p_partnership));
  return sid;
end;
$$;

create or replace function public.unshare_item(p_share uuid)
returns void language plpgsql security definer set search_path = public as $$
declare uid uuid := public.sharing_gate();
begin
  delete from public.shares where id = p_share and owner_id = uid;
  if not found then raise exception 'not_found'; end if;
  perform public.sharing_log('sharing_unshare', 'info', jsonb_build_object('share', p_share));
end;
$$;

/* ---------------- what the profile screen and the bell show ---------------- */

create or replace function public.sharing_overview()
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  mine text;
  out jsonb;
begin
  if not public.sharing_available() then return jsonb_build_object('available', false); end if;
  mine := public.sharing_my_email();

  select jsonb_build_object(
    'available', true,
    'enabled', public.sharing_is_on(uid),
    'incoming', coalesce((
      select jsonb_agg(jsonb_build_object('id', p.id, 'from_name', public.sharing_name(p.requester_id), 'from_email', public.sharing_email_of(p.requester_id), 'created_at', p.created_at) order by p.created_at desc)
      from public.partnerships p where p.status = 'pending' and p.expires_at > now() and p.invitee_email = mine and p.requester_id <> uid), '[]'::jsonb),
    'partners', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', p.id,
        'status', p.status,
        'direction', case when p.requester_id = uid then 'sent' else 'received' end,
        'name', case when p.status = 'active' then public.sharing_name(public.sharing_other(p, uid)) else null end,
        'email', case when p.requester_id = uid then p.invitee_email else public.sharing_email_of(p.requester_id) end,
        'since', p.responded_at,
        'created_at', p.created_at) order by p.created_at desc)
      from public.partnerships p
      where (p.requester_id = uid and (p.status = 'active' or (p.status = 'pending' and p.expires_at > now())))
         or (p.invitee_id = uid and p.status = 'active')), '[]'::jsonb),
    'accepted', coalesce((
      select jsonb_agg(jsonb_build_object('id', p.id, 'name', public.sharing_name(p.invitee_id), 'at', p.responded_at))
      from public.partnerships p where p.requester_id = uid and p.status = 'active' and p.responded_at > now() - interval '7 days'), '[]'::jsonb),
    'shares', coalesce((
      select jsonb_agg(jsonb_build_object('id', s.id, 'partnership_id', s.partnership_id, 'kind', s.kind, 'item_id', s.item_id))
      from public.shares s join public.partnerships p on p.id = s.partnership_id
      where s.owner_id = uid and p.status = 'active'), '[]'::jsonb)
  ) into out;
  return out;
end;
$$;

/* ---------------- what a partner can read (with the failsafe) ---------------- */

-- Trips the failsafe: sharing goes off for everyone until an admin looks.
create or replace function public.sharing_trip_failsafe(p_what text, p_details jsonb)
returns void language plpgsql security definer set search_path = public as $$
begin
  update public.app_settings set sharing_disabled = true where id = 1;
  perform public.sharing_log('leak_blocked', 'critical', jsonb_build_object('function', p_what) || coalesce(p_details, '{}'::jsonb));
end;
$$;

create or replace function public.shared_loyalty_cards()
returns table (share_id uuid, card_id uuid, store_name text, holder_name text, category text, card_number text,
               barcode_format text, color text, has_image boolean, shared_by text)
language plpgsql volatile security definer set search_path = public as $$
declare
  uid uuid := public.sharing_gate();
  found_rows jsonb;
  bad integer;
begin
  select coalesce(jsonb_agg(to_jsonb(r)), '[]'::jsonb) into found_rows from (
    select s.id as share_id, c.id as card_id, c.store_name, c.holder_name, c.category, c.card_number, c.barcode_format, c.color,
           (c.image_path is not null) as has_image, public.sharing_name(s.owner_id) as shared_by
    from public.shares s
    join public.partnerships p on p.id = s.partnership_id
    join public.loyalty_cards c on c.id = s.item_id and c.user_id = s.owner_id
    where s.kind = 'loyalty_card' and p.status = 'active'
      and ((p.requester_id = uid and s.owner_id = p.invitee_id) or (p.invitee_id = uid and s.owner_id = p.requester_id))
    order by c.store_name
  ) r;

  -- failsafe: re-check every row a second, different way
  select count(*) into bad from jsonb_to_recordset(found_rows) as x(share_id uuid, card_id uuid)
  where not exists (
    select 1 from public.shares s2
    join public.partnerships p2 on p2.id = s2.partnership_id
    join public.loyalty_cards c2 on c2.id = s2.item_id
    where s2.id = x.share_id and s2.kind = 'loyalty_card' and s2.item_id = x.card_id and p2.status = 'active'
      and c2.user_id = s2.owner_id and s2.owner_id <> uid
      and uid in (p2.requester_id, p2.invitee_id) and s2.owner_id in (p2.requester_id, p2.invitee_id)
  );
  if bad > 0 then
    perform public.sharing_trip_failsafe('shared_loyalty_cards', jsonb_build_object('rows', bad));
    return;
  end if;

  return query select x.share_id, x.card_id, x.store_name, x.holder_name, x.category, x.card_number, x.barcode_format, x.color, x.has_image, x.shared_by
  from jsonb_to_recordset(found_rows) as x(share_id uuid, card_id uuid, store_name text, holder_name text, category text,
       card_number text, barcode_format text, color text, has_image boolean, shared_by text);
end;
$$;

-- Four columns only, written out on purpose: a column added to trips later is NOT shared until it is added here.
create or replace function public.shared_trips()
returns table (share_id uuid, kind text, trip_id uuid, name text, destination text, start_date date, end_date date, shared_by text)
language plpgsql volatile security definer set search_path = public as $$
declare
  uid uuid := public.sharing_gate();
  found_rows jsonb;
  bad integer;
begin
  select coalesce(jsonb_agg(to_jsonb(r)), '[]'::jsonb) into found_rows from (
    select s.id as share_id, s.kind, t.id as trip_id, t.name, t.destination, t.start_date, t.end_date, public.sharing_name(s.owner_id) as shared_by
    from public.shares s
    join public.partnerships p on p.id = s.partnership_id
    join public.trips t on t.id = s.item_id and t.user_id = s.owner_id
    where s.kind = 'trip' and p.status = 'active'
      and ((p.requester_id = uid and s.owner_id = p.invitee_id) or (p.invitee_id = uid and s.owner_id = p.requester_id))
    union all
    select s.id, s.kind, j.id, j.name, j.destination, j.start_date, j.end_date, public.sharing_name(s.owner_id)
    from public.shares s
    join public.partnerships p on p.id = s.partnership_id
    join public.personal_projects j on j.id = s.item_id and j.user_id = s.owner_id and j.kind = 'personal_trip'
    where s.kind = 'personal_trip' and p.status = 'active'
      and ((p.requester_id = uid and s.owner_id = p.invitee_id) or (p.invitee_id = uid and s.owner_id = p.requester_id))
    order by start_date desc nulls last
  ) r;

  select count(*) into bad from jsonb_to_recordset(found_rows) as x(share_id uuid, kind text, trip_id uuid)
  where not exists (
    select 1 from public.shares s2
    join public.partnerships p2 on p2.id = s2.partnership_id
    where s2.id = x.share_id and s2.kind = x.kind and s2.item_id = x.trip_id and p2.status = 'active'
      and s2.owner_id <> uid and uid in (p2.requester_id, p2.invitee_id) and s2.owner_id in (p2.requester_id, p2.invitee_id)
  );
  if bad > 0 then
    perform public.sharing_trip_failsafe('shared_trips', jsonb_build_object('rows', bad));
    return;
  end if;

  return query select x.share_id, x.kind, x.trip_id, x.name, x.destination, x.start_date, x.end_date, x.shared_by
  from jsonb_to_recordset(found_rows) as x(share_id uuid, kind text, trip_id uuid, name text, destination text,
       start_date date, end_date date, shared_by text);
end;
$$;

-- For the photo route: the storage path of a shared card's photo, only while the share is live. Null otherwise.
create or replace function public.shared_loyalty_photo_path(p_card uuid)
returns text language plpgsql stable security definer set search_path = public as $$
declare
  uid uuid := public.sharing_gate();
  path text;
begin
  select c.image_path into path
  from public.shares s
  join public.partnerships p on p.id = s.partnership_id
  join public.loyalty_cards c on c.id = s.item_id and c.user_id = s.owner_id
  where s.kind = 'loyalty_card' and c.id = p_card and p.status = 'active' and s.owner_id <> uid
    and ((p.requester_id = uid and s.owner_id = p.invitee_id) or (p.invitee_id = uid and s.owner_id = p.requester_id))
  limit 1;
  return path;
end;
$$;

/* ---------------- clean-up and the daily integrity check ---------------- */

-- Deleting a card or a trip removes its shares
create or replace function public.sharing_drop_item_shares()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  delete from public.shares where kind = tg_argv[0] and item_id = old.id;
  return old;
end;
$$;

drop trigger if exists loyalty_cards_drop_shares on public.loyalty_cards;
create trigger loyalty_cards_drop_shares after delete on public.loyalty_cards
  for each row execute function public.sharing_drop_item_shares('loyalty_card');
drop trigger if exists trips_drop_shares on public.trips;
create trigger trips_drop_shares after delete on public.trips
  for each row execute function public.sharing_drop_item_shares('trip');
drop trigger if exists personal_projects_drop_shares on public.personal_projects;
create trigger personal_projects_drop_shares after delete on public.personal_projects
  for each row execute function public.sharing_drop_item_shares('personal_trip');

-- Run daily by the server (service role). Counts shares that should not exist; if there are any, sharing is switched off.
create or replace function public.sharing_integrity_check()
returns integer language plpgsql security definer set search_path = public as $$
declare bad integer;
begin
  select count(*) into bad from public.shares s
  where not exists (select 1 from public.partnerships p where p.id = s.partnership_id and p.status = 'active' and s.owner_id in (p.requester_id, p.invitee_id))
     or (s.kind = 'loyalty_card' and not exists (select 1 from public.loyalty_cards c where c.id = s.item_id and c.user_id = s.owner_id))
     or (s.kind = 'trip' and not exists (select 1 from public.trips t where t.id = s.item_id and t.user_id = s.owner_id))
     or (s.kind = 'personal_trip' and not exists (select 1 from public.personal_projects j where j.id = s.item_id and j.user_id = s.owner_id and j.kind = 'personal_trip'));
  if bad > 0 then
    perform public.sharing_trip_failsafe('sharing_integrity_check', jsonb_build_object('rows', bad));
  end if;
  return bad;
end;
$$;

/* ---------------- who may call what ---------------- */

revoke all on function public.sharing_my_email() from public, anon, authenticated;
revoke all on function public.sharing_name(uuid) from public, anon, authenticated;
revoke all on function public.sharing_email_of(uuid) from public, anon, authenticated;
revoke all on function public.sharing_log(text, text, jsonb) from public, anon, authenticated;
revoke all on function public.sharing_gate() from public, anon, authenticated;
revoke all on function public.sharing_is_on(uuid) from public, anon, authenticated;
revoke all on function public.sharing_active_count(uuid) from public, anon, authenticated;
revoke all on function public.sharing_other(public.partnerships, uuid) from public, anon, authenticated;
revoke all on function public.sharing_trip_failsafe(text, jsonb) from public, anon, authenticated;
revoke all on function public.sharing_drop_item_shares() from public, anon, authenticated;
revoke all on function public.sharing_integrity_check() from public, anon, authenticated;
revoke all on function public.sharing_available() from public, anon;

grant execute on function public.sharing_available() to authenticated;
revoke all on function public.set_sharing(boolean) from public, anon;
grant execute on function public.set_sharing(boolean) to authenticated;
revoke all on function public.invite_partner(text) from public, anon;
grant execute on function public.invite_partner(text) to authenticated;
revoke all on function public.respond_to_invite(uuid, text) from public, anon;
grant execute on function public.respond_to_invite(uuid, text) to authenticated;
revoke all on function public.end_partnership(uuid) from public, anon;
grant execute on function public.end_partnership(uuid) to authenticated;
revoke all on function public.share_item(uuid, text, uuid) from public, anon;
grant execute on function public.share_item(uuid, text, uuid) to authenticated;
revoke all on function public.unshare_item(uuid) from public, anon;
grant execute on function public.unshare_item(uuid) to authenticated;
revoke all on function public.sharing_overview() from public, anon;
grant execute on function public.sharing_overview() to authenticated;
revoke all on function public.shared_loyalty_cards() from public, anon;
grant execute on function public.shared_loyalty_cards() to authenticated;
revoke all on function public.shared_trips() from public, anon;
grant execute on function public.shared_trips() to authenticated;
revoke all on function public.shared_loyalty_photo_path(uuid) from public, anon;
grant execute on function public.shared_loyalty_photo_path(uuid) to authenticated;
grant execute on function public.sharing_integrity_check() to service_role;
