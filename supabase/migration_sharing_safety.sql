-- Sharing safety: who looked at what I shared, phone notifications, and "my data" (scheduled account deletion).
-- Run once in the Supabase SQL Editor, after migration_sharing.sql. Safe to run again.
--
--  1. share_activity       each person's own history: partners opening shared items, and every share / unshare / invite /
--                          accepted invite / ended partnership. Closed table: people read it only through sharing_activity().
--  2. push_subscriptions   one row per phone or computer that turned alerts on. profiles.push_prefs holds what they asked for.
--  3. account_deletions    a deletion the person scheduled (7 days). The daily job removes the account when it is due.

/* ---------------- 1. activity history ---------------- */

create table if not exists public.share_activity (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,      -- whose history this row belongs to
  partner_id uuid references auth.users(id) on delete set null,
  kind text not null check (kind in ('view', 'share', 'unshare', 'invite', 'accept', 'end', 'end_by_partner')),
  item_kind text,
  item_id uuid,
  item_label text,                                                          -- the item's name, or the invited email for 'invite'
  created_at timestamptz not null default now()
);
create index if not exists share_activity_owner_idx on public.share_activity (owner_id, created_at desc);

alter table public.share_activity enable row level security;
revoke all on table public.share_activity from anon, authenticated;

create or replace function public.sharing_item_label(p_kind text, p_item uuid)
returns text language sql stable security definer set search_path = public as $$
  select case p_kind
    when 'loyalty_card' then (select store_name from public.loyalty_cards where id = p_item)
    when 'trip' then (select name from public.trips where id = p_item)
    when 'personal_trip' then (select name from public.personal_projects where id = p_item)
  end
$$;

-- Invites, accepted invites and ended partnerships write to the history by themselves (no change to the sharing functions).
create or replace function public.share_activity_partnership()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  actor uuid := auth.uid();
  other uuid;
begin
  if tg_op = 'INSERT' then
    insert into public.share_activity (owner_id, kind, item_label) values (new.requester_id, 'invite', new.invitee_email);
  elsif new.status is distinct from old.status then
    if old.status = 'pending' and new.status = 'active' then
      insert into public.share_activity (owner_id, partner_id, kind) values (new.requester_id, new.invitee_id, 'accept');
    elsif new.status = 'ended' and old.status in ('pending', 'active')
          and not (old.status = 'pending' and old.expires_at < now())
          and actor in (new.requester_id, new.invitee_id) then
      other := case when actor = new.requester_id then new.invitee_id else new.requester_id end;
      insert into public.share_activity (owner_id, partner_id, kind, item_label)
        values (actor, other, 'end', case when other is null then new.invitee_email end);
      if other is not null and old.status = 'active' then
        insert into public.share_activity (owner_id, partner_id, kind) values (other, actor, 'end_by_partner');
      end if;
    end if;
  end if;
  return null;
exception when others then
  return null; -- the history must never break sharing
end;
$$;

drop trigger if exists partnerships_activity on public.partnerships;
create trigger partnerships_activity after insert or update on public.partnerships
  for each row execute function public.share_activity_partnership();

create or replace function public.share_activity_share()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  r public.shares;
  p public.partnerships;
  partner uuid;
begin
  r := case tg_op when 'INSERT' then new else old end;
  if not exists (select 1 from auth.users where id = r.owner_id) then return null; end if; -- the account itself is being removed
  select * into p from public.partnerships where id = r.partnership_id;
  if not found then return null; end if;
  partner := case when p.requester_id = r.owner_id then p.invitee_id else p.requester_id end;
  insert into public.share_activity (owner_id, partner_id, kind, item_kind, item_id, item_label)
    values (r.owner_id, partner, case tg_op when 'INSERT' then 'share' else 'unshare' end, r.kind, r.item_id, public.sharing_item_label(r.kind, r.item_id));
  return null;
exception when others then
  return null;
end;
$$;

drop trigger if exists shares_activity on public.shares;
create trigger shares_activity after insert or delete on public.shares
  for each row execute function public.share_activity_share();

-- A partner opened something I shared. Only works for a live share to the caller. True when a new entry was written;
-- the same person opening the same item again within an hour counts once.
create or replace function public.log_share_view(p_kind text, p_item uuid)
returns boolean language plpgsql security definer set search_path = public as $$
declare
  uid uuid := public.sharing_gate();
  owner uuid;
begin
  if p_kind not in ('loyalty_card', 'trip', 'personal_trip') then raise exception 'bad_kind'; end if;
  select s.owner_id into owner
  from public.shares s
  join public.partnerships p on p.id = s.partnership_id
  where s.kind = p_kind and s.item_id = p_item and p.status = 'active' and s.owner_id <> uid
    and ((p.requester_id = uid and s.owner_id = p.invitee_id) or (p.invitee_id = uid and s.owner_id = p.requester_id))
  limit 1;
  if owner is null then raise exception 'not_found'; end if;
  if exists (select 1 from public.share_activity
             where owner_id = owner and partner_id = uid and kind = 'view' and item_kind = p_kind and item_id = p_item
               and created_at > now() - interval '1 hour') then
    return false;
  end if;
  insert into public.share_activity (owner_id, partner_id, kind, item_kind, item_id, item_label)
    values (owner, uid, 'view', p_kind, p_item, public.sharing_item_label(p_kind, p_item));
  return true;
end;
$$;

-- My own history, newest first. p_filter: all | views | changes. p_partner: only that person. p_before: the page before this time.
create or replace function public.sharing_activity(p_filter text default 'all', p_partner uuid default null, p_before timestamptz default null, p_limit integer default 30)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  uid uuid := public.sharing_gate();
  lim integer := least(greatest(coalesce(p_limit, 30), 1), 100);
  rows_ jsonb;
  more boolean;
begin
  if p_filter not in ('all', 'views', 'changes') then raise exception 'bad_action'; end if;
  with page as (
    select a.* from public.share_activity a
    where a.owner_id = uid
      and (p_filter = 'all' or (p_filter = 'views' and a.kind = 'view') or (p_filter = 'changes' and a.kind <> 'view'))
      and (p_partner is null or a.partner_id = p_partner)
      and (p_before is null or a.created_at < p_before)
    order by a.created_at desc, a.id desc
    limit lim + 1
  ), numbered as (
    select g.*, row_number() over (order by g.created_at desc, g.id desc) as rn from page g
  )
  select coalesce(jsonb_agg(jsonb_build_object(
      'id', n.id, 'kind', n.kind, 'partner_id', n.partner_id,
      'partner', case when n.partner_id is null then n.item_label else public.sharing_name(n.partner_id) end,
      'item_kind', n.item_kind, 'item', n.item_label, 'at', n.created_at) order by n.rn) filter (where n.rn <= lim), '[]'::jsonb),
    count(*) > lim
  into rows_, more
  from numbered n;
  return jsonb_build_object(
    'items', rows_,
    'more', more,
    'partners', coalesce((
      select jsonb_agg(jsonb_build_object('id', d.partner_id, 'name', public.sharing_name(d.partner_id)) order by public.sharing_name(d.partner_id))
      from (select distinct partner_id from public.share_activity where owner_id = uid and partner_id is not null) d), '[]'::jsonb));
end;
$$;

-- Everything in my history, for "Export my data". Works even if sharing was switched off since.
create or replace function public.sharing_activity_export()
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'not_signed_in'; end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object('at', a.created_at, 'kind', a.kind, 'partner',
        case when a.partner_id is null then a.item_label else public.sharing_name(a.partner_id) end,
        'item_kind', a.item_kind, 'item', a.item_label) order by a.created_at desc)
    from public.share_activity a where a.owner_id = auth.uid()), '[]'::jsonb);
end;
$$;

-- Daily clean-up: history is kept for 12 months (service role, from the daily sharing job)
create or replace function public.share_activity_purge()
returns integer language plpgsql security definer set search_path = public as $$
declare n integer;
begin
  delete from public.share_activity where created_at < now() - interval '12 months';
  get diagnostics n = row_count;
  return n;
end;
$$;

/* ---------------- 2. phone notifications ---------------- */

create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  user_agent text,
  created_at timestamptz not null default now()
);
create index if not exists push_subscriptions_user_idx on public.push_subscriptions (user_id);

alter table public.push_subscriptions enable row level security;
drop policy if exists "Own push subscriptions read" on public.push_subscriptions;
create policy "Own push subscriptions read" on public.push_subscriptions for select using (user_id = auth.uid());
drop policy if exists "Own push subscriptions delete" on public.push_subscriptions;
create policy "Own push subscriptions delete" on public.push_subscriptions for delete using (user_id = auth.uid());
-- Rows are written by the server (it takes an endpoint over from the previous person on a shared device), never by the browser.
revoke insert, update on table public.push_subscriptions from anon, authenticated;

alter table public.profiles add column if not exists push_prefs jsonb not null default '{"invites": true, "shared": true, "views": false}'::jsonb;

-- Who to tell (server only: service role)
create or replace function public.push_user_by_email(p_email text)
returns uuid language sql stable security definer set search_path = public as $$
  select id from auth.users where lower(email) = lower(trim(coalesce(p_email, ''))) limit 1
$$;

create or replace function public.push_other_party(p_partnership uuid, p_me uuid)
returns uuid language sql stable security definer set search_path = public as $$
  select case when requester_id = p_me then invitee_id when invitee_id = p_me then requester_id end
  from public.partnerships where id = p_partnership
$$;

create or replace function public.push_share_partner(p_share uuid, p_me uuid)
returns uuid language sql stable security definer set search_path = public as $$
  select case when p.requester_id = s.owner_id then p.invitee_id else p.requester_id end
  from public.shares s join public.partnerships p on p.id = s.partnership_id
  where s.id = p_share and s.owner_id = p_me
$$;

create or replace function public.push_view_owner(p_viewer uuid, p_kind text, p_item uuid)
returns uuid language sql stable security definer set search_path = public as $$
  select s.owner_id
  from public.shares s join public.partnerships p on p.id = s.partnership_id
  where s.kind = p_kind and s.item_id = p_item and p.status = 'active' and s.owner_id <> p_viewer
    and ((p.requester_id = p_viewer and s.owner_id = p.invitee_id) or (p.invitee_id = p_viewer and s.owner_id = p.requester_id))
  limit 1
$$;

/* ---------------- 3. scheduled account deletion ---------------- */

create table if not exists public.account_deletions (
  user_id uuid primary key references auth.users(id) on delete cascade,
  requested_at timestamptz not null default now(),
  delete_after timestamptz not null default (now() + interval '7 days')
);

alter table public.account_deletions enable row level security;
drop policy if exists "Own deletion read" on public.account_deletions;
create policy "Own deletion read" on public.account_deletions for select using (user_id = auth.uid());
-- A person can schedule their own deletion no sooner than the waiting time, and cancel it. Nothing else.
drop policy if exists "Own deletion schedule" on public.account_deletions;
create policy "Own deletion schedule" on public.account_deletions for insert
  with check (user_id = auth.uid() and delete_after >= now() + interval '6 days');
drop policy if exists "Own deletion cancel" on public.account_deletions;
create policy "Own deletion cancel" on public.account_deletions for delete using (user_id = auth.uid());
revoke update on table public.account_deletions from anon, authenticated;

create or replace function public.account_deletions_due()
returns table (user_id uuid) language sql stable security definer set search_path = public as $$
  select d.user_id from public.account_deletions d where d.delete_after <= now() order by d.delete_after limit 50
$$;

/* ---------------- who may call what ---------------- */

revoke all on function public.sharing_item_label(text, uuid) from public, anon, authenticated;
revoke all on function public.share_activity_partnership() from public, anon, authenticated;
revoke all on function public.share_activity_share() from public, anon, authenticated;
revoke all on function public.share_activity_purge() from public, anon, authenticated;
revoke all on function public.push_user_by_email(text) from public, anon, authenticated;
revoke all on function public.push_other_party(uuid, uuid) from public, anon, authenticated;
revoke all on function public.push_share_partner(uuid, uuid) from public, anon, authenticated;
revoke all on function public.push_view_owner(uuid, text, uuid) from public, anon, authenticated;
revoke all on function public.account_deletions_due() from public, anon, authenticated;
grant execute on function public.share_activity_purge() to service_role;
grant execute on function public.push_user_by_email(text) to service_role;
grant execute on function public.push_other_party(uuid, uuid) to service_role;
grant execute on function public.push_share_partner(uuid, uuid) to service_role;
grant execute on function public.push_view_owner(uuid, text, uuid) to service_role;
grant execute on function public.account_deletions_due() to service_role;

revoke all on function public.log_share_view(text, uuid) from public, anon;
grant execute on function public.log_share_view(text, uuid) to authenticated;
revoke all on function public.sharing_activity(text, uuid, timestamptz, integer) from public, anon;
grant execute on function public.sharing_activity(text, uuid, timestamptz, integer) to authenticated;
revoke all on function public.sharing_activity_export() from public, anon;
grant execute on function public.sharing_activity_export() to authenticated;

notify pgrst, 'reload schema';
