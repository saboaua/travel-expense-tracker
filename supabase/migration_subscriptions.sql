-- Subscriptions (Personal) and IPTV clients (admin only).
-- Run in the Supabase SQL Editor (safe to run more than once). Needs migration_roles.sql, migration_personal.sql and
-- migration_branding_roles.sql (app_settings) first.
--
-- 1. subscriptions        each person's own subscriptions. Owner only, and only while the role has "subscriptions".
-- 2. iptv_clients         the clients an ADMIN sells to. Only an admin can read or write them (not delegated to a role).
--    iptv_renewals        one row per renewal, shown to the client as their history.
-- 3. Three ways a client sees their own service, none of which opens the tables:
--      a link      iptv_public_view(token)   (server only: the browser cannot call it, so tokens cannot be guessed at)
--      a login     my_iptv_subscriptions()   (the client signs in with the "IPTV client" role)
--      in the app  my_iptv_subscriptions()   (a normal user whose account the admin linked)
--    All three return only: first name, package, plan, dates and renewal history. Never MAC, ID, order, donation, portal.
-- 4. app_settings.client_links_disabled is the admin kill switch for all three; iptv_contact is the WhatsApp number shown.

/* ---------------- 1. my subscriptions ---------------- */

create or replace function public.personal_touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table if not exists public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 80),
  price numeric(12,2) not null check (price >= 0 and price < 1000000),
  currency text not null default 'USD' check (currency ~ '^[A-Z]{3}$'),
  cycle text not null default 'monthly' check (cycle in ('weekly', 'monthly', 'quarterly', 'yearly')),
  next_payment date not null,
  category text check (category is null or char_length(category) <= 40),
  status text not null default 'active' check (status in ('active', 'paused', 'cancelled')),
  trial_ends date,
  split_count integer not null default 1 check (split_count between 1 and 20),
  remind_days integer not null default 3 check (remind_days between 0 and 30),
  cancel_url text check (cancel_url is null or (char_length(cancel_url) <= 500 and cancel_url ~* '^https?://')),
  notes text check (notes is null or char_length(notes) <= 500),
  price_history jsonb not null default '[]'::jsonb check (jsonb_typeof(price_history) = 'array' and jsonb_array_length(price_history) <= 50),
  reminded_for date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists subscriptions_user_idx on public.subscriptions (user_id, next_payment);

drop trigger if exists subscriptions_touch on public.subscriptions;
create trigger subscriptions_touch before update on public.subscriptions
  for each row execute function public.personal_touch_updated_at();

alter table public.subscriptions enable row level security;
drop policy if exists "Own subscriptions" on public.subscriptions;
create policy "Own subscriptions" on public.subscriptions
  for all to authenticated
  using (user_id = (select auth.uid()) and public.has_permission('subscriptions'))
  with check (user_id = (select auth.uid()) and public.has_permission('subscriptions'));
revoke all on table public.subscriptions from anon;

/* ---------------- 2. IPTV clients (admin only) ---------------- */

alter table public.app_settings add column if not exists client_links_disabled boolean not null default false;
alter table public.app_settings add column if not exists iptv_contact text check (iptv_contact is null or char_length(iptv_contact) <= 40);

create or replace function public.iptv_is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role = 'admin')
$$;

create or replace function public.iptv_months(p_frequency text)
returns integer language sql immutable as $$
  select case p_frequency when 'monthly' then 1 when 'yearly' then 12 when '2years' then 24 when '3years' then 36 end
$$;

create table if not exists public.iptv_clients (
  id uuid primary key default gen_random_uuid(),
  created_by uuid references auth.users(id) on delete set null,
  client_name text not null check (char_length(client_name) between 1 and 80),
  contact text check (contact is null or char_length(contact) <= 120),
  plan text not null check (char_length(plan) between 1 and 60),                 -- SUBSCRIPTION
  model text check (model is null or char_length(model) <= 60),
  order_no text check (order_no is null or char_length(order_no) <= 40),
  donation text,
  portal text check (portal is null or (char_length(portal) <= 300 and portal ~* '^https?://')),
  mac text check (mac is null or mac ~ '^([0-9A-F]{2}:){5}[0-9A-F]{2}$'),
  device_id text check (device_id is null or char_length(device_id) <= 60),      -- ID
  location text check (location is null or char_length(location) <= 80),
  date_subscribed date not null,
  frequency text not null check (frequency in ('monthly', 'yearly', '2years', '3years')),
  renewal_date date,                                                              -- last renewal
  expire_date date not null,                                                      -- date subscribed + frequency, moved on by each renewal
  notes text check (notes is null or char_length(notes) <= 500),
  share_token text unique check (share_token is null or char_length(share_token) >= 32),
  share_enabled boolean not null default false,
  client_user_id uuid references auth.users(id) on delete set null,
  reminded_for date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint iptv_clients_dates_check check (expire_date >= date_subscribed)
);
create index if not exists iptv_clients_expire_idx on public.iptv_clients (expire_date);
create index if not exists iptv_clients_user_idx on public.iptv_clients (client_user_id);

drop trigger if exists iptv_clients_touch on public.iptv_clients;
create trigger iptv_clients_touch before update on public.iptv_clients
  for each row execute function public.personal_touch_updated_at();

create table if not exists public.iptv_renewals (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.iptv_clients(id) on delete cascade,
  renewed_on date not null,
  frequency text not null check (frequency in ('monthly', 'yearly', '2years', '3years')),
  expires_after date not null,
  created_at timestamptz not null default now()
);
create index if not exists iptv_renewals_client_idx on public.iptv_renewals (client_id, renewed_on desc);

alter table public.iptv_clients enable row level security;
alter table public.iptv_renewals enable row level security;
drop policy if exists "Admin manages iptv clients" on public.iptv_clients;
create policy "Admin manages iptv clients" on public.iptv_clients
  for all to authenticated using (public.iptv_is_admin()) with check (public.iptv_is_admin());
drop policy if exists "Admin manages iptv renewals" on public.iptv_renewals;
create policy "Admin manages iptv renewals" on public.iptv_renewals
  for all to authenticated using (public.iptv_is_admin()) with check (public.iptv_is_admin());
-- Donation is the payment reference the client gave (for example J17454B8498X), not an amount.
-- Also fixes databases that already ran the first version of this file, where it was a number.
alter table public.iptv_clients drop constraint if exists iptv_clients_donation_check;
alter table public.iptv_clients alter column donation type text using donation::text;
alter table public.iptv_clients drop constraint if exists iptv_clients_donation_ref;
alter table public.iptv_clients add constraint iptv_clients_donation_ref check (donation is null or donation ~ '^[A-Za-z0-9._-]{1,40}$');

revoke all on table public.iptv_clients, public.iptv_renewals from anon;

/* ---- admin actions ---- */

-- Renew: the expiry moves forward by one more period, counted from the old expiry (or from today when it already lapsed).
create or replace function public.iptv_renew(p_client uuid, p_on date default current_date)
returns date language plpgsql security definer set search_path = public as $$
declare c public.iptv_clients; new_exp date;
begin
  if not public.iptv_is_admin() then raise exception 'forbidden' using errcode = '42501'; end if;
  select * into c from public.iptv_clients where id = p_client for update;
  if not found then raise exception 'not_found'; end if;
  new_exp := (greatest(c.expire_date, p_on) + make_interval(months => public.iptv_months(c.frequency)))::date;
  update public.iptv_clients set expire_date = new_exp, renewal_date = p_on, reminded_for = null where id = p_client;
  insert into public.iptv_renewals (client_id, renewed_on, frequency, expires_after) values (p_client, p_on, c.frequency, new_exp);
  return new_exp;
end;
$$;

create or replace function public.iptv_create_link(p_client uuid)
returns text language plpgsql security definer set search_path = public as $$
declare t text;
begin
  if not public.iptv_is_admin() then raise exception 'forbidden' using errcode = '42501'; end if;
  select share_token into t from public.iptv_clients where id = p_client for update;
  if not found then raise exception 'not_found'; end if;
  if t is null then t := substr(replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', ''), 1, 40); end if;
  update public.iptv_clients set share_token = t, share_enabled = true where id = p_client;
  return t;
end;
$$;

-- Stopping a link forgets the token, so the old address never works again (a new one is made if sharing is turned on later)
create or replace function public.iptv_stop_link(p_client uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.iptv_is_admin() then raise exception 'forbidden' using errcode = '42501'; end if;
  update public.iptv_clients set share_token = null, share_enabled = false where id = p_client;
end;
$$;

create or replace function public.iptv_link_user(p_client uuid, p_email text)
returns boolean language plpgsql security definer set search_path = public as $$
declare uid uuid;
begin
  if not public.iptv_is_admin() then raise exception 'forbidden' using errcode = '42501'; end if;
  select id into uid from auth.users where lower(email) = lower(btrim(p_email));
  if uid is null then return false; end if;
  update public.iptv_clients set client_user_id = uid where id = p_client;
  return found;
end;
$$;

create or replace function public.iptv_unlink_user(p_client uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.iptv_is_admin() then raise exception 'forbidden' using errcode = '42501'; end if;
  update public.iptv_clients set client_user_id = null where id = p_client;
end;
$$;

/* ---- what a client may see: a fixed, short list of fields ---- */

create or replace function public.iptv_client_shape(c public.iptv_clients)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'first_name', split_part(c.client_name, ' ', 1),
    'plan', c.plan,
    'frequency', c.frequency,
    'date_subscribed', c.date_subscribed,
    'expire_date', c.expire_date,
    'owner_name', (select coalesce(nullif(p.first_name, ''), 'your provider') from public.profiles p where p.id = c.created_by),
    'owner_contact', (select a.iptv_contact from public.app_settings a limit 1),
    'history', coalesce((
      select jsonb_agg(jsonb_build_object('renewed_on', r.renewed_on, 'frequency', r.frequency, 'expires_after', r.expires_after) order by r.renewed_on desc, r.created_at desc)
      from public.iptv_renewals r where r.client_id = c.id), '[]'::jsonb)
  )
$$;

create or replace function public.iptv_public_view(p_token text)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare c public.iptv_clients;
begin
  if p_token is null or char_length(p_token) < 32 then return null; end if;
  if coalesce((select a.client_links_disabled from public.app_settings a limit 1), false) then return null; end if;
  select * into c from public.iptv_clients where share_token = p_token and share_enabled;
  if not found then return null; end if;
  return public.iptv_client_shape(c);
end;
$$;

create or replace function public.my_iptv_subscriptions()
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'not_signed_in' using errcode = '42501'; end if;
  if coalesce((select a.client_links_disabled from public.app_settings a limit 1), false) then return '[]'::jsonb; end if;
  return coalesce((select jsonb_agg(public.iptv_client_shape(c) order by c.expire_date) from public.iptv_clients c where c.client_user_id = auth.uid()), '[]'::jsonb);
end;
$$;

/* ---------------- who may call what ---------------- */

revoke all on function public.iptv_is_admin() from public, anon;
revoke all on function public.iptv_renew(uuid, date) from public, anon;
revoke all on function public.iptv_create_link(uuid) from public, anon;
revoke all on function public.iptv_stop_link(uuid) from public, anon;
revoke all on function public.iptv_link_user(uuid, text) from public, anon;
revoke all on function public.iptv_unlink_user(uuid) from public, anon;
revoke all on function public.iptv_client_shape(public.iptv_clients) from public, anon, authenticated;
revoke all on function public.iptv_public_view(text) from public, anon, authenticated;
revoke all on function public.my_iptv_subscriptions() from public, anon;
grant execute on function public.iptv_is_admin() to authenticated;
grant execute on function public.iptv_renew(uuid, date) to authenticated;
grant execute on function public.iptv_create_link(uuid) to authenticated;
grant execute on function public.iptv_stop_link(uuid) to authenticated;
grant execute on function public.iptv_link_user(uuid, text) to authenticated;
grant execute on function public.iptv_unlink_user(uuid) to authenticated;
grant execute on function public.my_iptv_subscriptions() to authenticated;
grant execute on function public.iptv_public_view(text) to service_role;
grant execute on function public.iptv_client_shape(public.iptv_clients) to service_role;

/* ---------------- roles ---------------- */

-- "subscriptions" goes to User and Assistant (as in the app's defaults); "iptv.mine" to nobody but the client role.
-- Both are marked reviewed everywhere, so they do not appear as "New" and are not handed to custom roles by themselves.
update public.roles set permissions = array_append(permissions, 'subscriptions')
  where key in ('user', 'assistant') and not ('subscriptions' = any (permissions));
update public.roles set known_features = array_append(known_features, 'subscriptions')
  where key <> 'admin' and not ('subscriptions' = any (known_features));
update public.roles set known_features = array_append(known_features, 'iptv.mine')
  where key <> 'admin' and not ('iptv.mine' = any (known_features));

-- The role a client gets when the admin makes them a login: one page, "My subscription"
insert into public.roles (key, label, description, permissions, known_features, is_system) values
  ('iptv-client', 'IPTV client', 'Sees only their own IPTV subscription and renewal history.', array['iptv.mine'],
   array['trips','reports','loyalty','personal','personal.dashboard','sharing','documents','users.manage','security.view','categories.manage','currencies.manage','branding.manage','telegram.manage','help.manage','support.view','subscriptions','iptv.mine'], false)
on conflict (key) do nothing;

notify pgrst, 'reload schema';
