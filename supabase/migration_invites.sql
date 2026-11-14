-- Recommend Lifolio to a friend: each person gets one personal invite link (a random code). Run in the Supabase SQL Editor (safe to run more than once).
-- Needs migration_account_requests.sql first.
--
--  * The invite page /invite/<code> is public. It can show the person's first name if they allow it. It shows nothing else about them.
--  * A friend who uses the link asks for an account as usual; the request keeps WHO recommended them, for the administrators.
--  * The person who shared only ever sees a COUNT of friends who asked. Never names or contact details.
--  * Making a new link stops the old one working. Deleting the account removes the link.

create table if not exists public.invite_links (
  user_id uuid primary key references auth.users(id) on delete cascade,
  code text not null unique check (code ~ '^[A-Z0-9]{10}$'),
  show_name boolean not null default true,
  created_at timestamptz not null default now()
);
alter table public.invite_links enable row level security;
-- No policies and no grants on purpose: the app uses the functions below, and the website's server reads it for the invite page.
revoke all on public.invite_links from anon, authenticated;

alter table public.account_requests add column if not exists referred_by uuid references auth.users(id) on delete set null;

create or replace function public._new_invite_code() returns text
language sql volatile as $$
  select upper(substr(replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''), 1, 10))
$$;
revoke all on function public._new_invite_code() from public, anon, authenticated;

-- My link, made the first time it is asked for. Also how many friends asked for an account with it (a count only).
create or replace function public.my_invite() returns table (code text, show_name boolean, friends integer)
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'Sign in first'; end if;
  insert into public.invite_links (user_id, code) values (auth.uid(), public._new_invite_code()) on conflict (user_id) do nothing;
  return query
    select l.code, l.show_name, (select count(*)::integer from public.account_requests r where r.referred_by = auth.uid())
    from public.invite_links l where l.user_id = auth.uid();
end $$;

-- A new link: the old one stops working at once
create or replace function public.reset_my_invite() returns text
language plpgsql security definer set search_path = public as $$
declare c text;
begin
  if auth.uid() is null then raise exception 'Sign in first'; end if;
  c := public._new_invite_code();
  insert into public.invite_links (user_id, code) values (auth.uid(), c)
    on conflict (user_id) do update set code = excluded.code, created_at = now();
  return c;
end $$;

create or replace function public.set_invite_show_name(show boolean) returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'Sign in first'; end if;
  insert into public.invite_links (user_id, code, show_name) values (auth.uid(), public._new_invite_code(), show)
    on conflict (user_id) do update set show_name = excluded.show_name;
end $$;

revoke all on function public.my_invite(), public.reset_my_invite(), public.set_invite_show_name(boolean) from public, anon;
grant execute on function public.my_invite(), public.reset_my_invite(), public.set_invite_show_name(boolean) to authenticated;

notify pgrst, 'reload schema';
