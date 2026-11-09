-- Migration 37: one IPTV client can have several subscriptions (one link / one login shows them all)
-- Needs migration 36 (migration_subscriptions.sql). Safe to run twice.
--
-- Before: every iptv_clients row was a person AND a subscription. After:
--   iptv_customers  = the person (name, contact, the shareable link, the client's login)
--   iptv_clients    = one subscription (plan, model, MAC, dates, ...), belonging to a customer
-- Every existing row becomes one customer with one subscription, keeping its link and login.

create table if not exists public.iptv_customers (
  id uuid primary key default gen_random_uuid(),
  created_by uuid references auth.users(id) on delete set null,
  name text not null check (char_length(name) between 1 and 80),
  contact text check (contact is null or char_length(contact) <= 120),           -- WhatsApp number or email
  share_token text unique check (share_token is null or char_length(share_token) >= 32),
  share_enabled boolean not null default false,
  client_user_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists iptv_customers_user_idx on public.iptv_customers (client_user_id);

drop trigger if exists iptv_customers_touch on public.iptv_customers;
create trigger iptv_customers_touch before update on public.iptv_customers
  for each row execute function public.personal_touch_updated_at();

alter table public.iptv_customers enable row level security;
drop policy if exists "Admin manages iptv customers" on public.iptv_customers;
create policy "Admin manages iptv customers" on public.iptv_customers
  for all to authenticated using (public.iptv_is_admin()) with check (public.iptv_is_admin());
revoke all on table public.iptv_customers from anon;

alter table public.iptv_clients add column if not exists customer_id uuid references public.iptv_customers(id) on delete cascade;

-- Move the person-level columns over (only while they still exist on iptv_clients)
do $$
begin
  if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'iptv_clients' and column_name = 'client_name') then
    insert into public.iptv_customers (id, created_by, name, contact, share_token, share_enabled, client_user_id, created_at)
      select id, created_by, client_name, contact, share_token, share_enabled, client_user_id, created_at
      from public.iptv_clients where customer_id is null
      on conflict (id) do nothing;
    update public.iptv_clients set customer_id = id where customer_id is null;
    drop index if exists public.iptv_clients_user_idx;
    alter table public.iptv_clients drop column client_name;
    alter table public.iptv_clients drop column contact;
    alter table public.iptv_clients drop column share_token;
    alter table public.iptv_clients drop column share_enabled;
    alter table public.iptv_clients drop column client_user_id;
  end if;
end $$;
alter table public.iptv_clients alter column customer_id set not null;
create index if not exists iptv_clients_customer_idx on public.iptv_clients (customer_id);

/* ---- admin actions (now on the customer) ---- */

drop function if exists public.iptv_create_link(uuid);
drop function if exists public.iptv_stop_link(uuid);
drop function if exists public.iptv_link_user(uuid, text);
drop function if exists public.iptv_unlink_user(uuid);
drop function if exists public.iptv_public_view(text);
drop function if exists public.iptv_client_shape(public.iptv_clients);

create or replace function public.iptv_create_link(p_customer uuid)
returns text language plpgsql security definer set search_path = public as $$
declare t text;
begin
  if not public.iptv_is_admin() then raise exception 'forbidden' using errcode = '42501'; end if;
  select share_token into t from public.iptv_customers where id = p_customer for update;
  if not found then raise exception 'not_found'; end if;
  if t is null then t := substr(replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', ''), 1, 40); end if;
  update public.iptv_customers set share_token = t, share_enabled = true where id = p_customer;
  return t;
end;
$$;

create or replace function public.iptv_stop_link(p_customer uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.iptv_is_admin() then raise exception 'forbidden' using errcode = '42501'; end if;
  update public.iptv_customers set share_token = null, share_enabled = false where id = p_customer;
end;
$$;

create or replace function public.iptv_link_user(p_customer uuid, p_email text)
returns boolean language plpgsql security definer set search_path = public as $$
declare uid uuid;
begin
  if not public.iptv_is_admin() then raise exception 'forbidden' using errcode = '42501'; end if;
  select id into uid from auth.users where lower(email) = lower(btrim(p_email));
  if uid is null then return false; end if;
  update public.iptv_customers set client_user_id = uid where id = p_customer;
  return found;
end;
$$;

create or replace function public.iptv_unlink_user(p_customer uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.iptv_is_admin() then raise exception 'forbidden' using errcode = '42501'; end if;
  update public.iptv_customers set client_user_id = null where id = p_customer;
end;
$$;

/* ---- what a client may see: a fixed, short list of fields ---- */

create or replace function public.iptv_subscription_shape(s public.iptv_clients)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'plan', s.plan,
    'model', s.model,
    'frequency', s.frequency,
    'date_subscribed', s.date_subscribed,
    'expire_date', s.expire_date,
    'history', coalesce((
      select jsonb_agg(jsonb_build_object('renewed_on', r.renewed_on, 'frequency', r.frequency, 'expires_after', r.expires_after) order by r.renewed_on desc, r.created_at desc)
      from public.iptv_renewals r where r.client_id = s.id), '[]'::jsonb)
  )
$$;

create or replace function public.iptv_customer_view(c public.iptv_customers)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'first_name', split_part(c.name, ' ', 1),
    'owner_name', (select coalesce(nullif(p.first_name, ''), 'your provider') from public.profiles p where p.id = c.created_by),
    'owner_contact', (select a.iptv_contact from public.app_settings a limit 1),
    'subscriptions', coalesce((select jsonb_agg(public.iptv_subscription_shape(s) order by s.expire_date, s.created_at) from public.iptv_clients s where s.customer_id = c.id), '[]'::jsonb)
  )
$$;

create or replace function public.iptv_public_view(p_token text)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare c public.iptv_customers;
begin
  if p_token is null or char_length(p_token) < 32 then return null; end if;
  if coalesce((select a.client_links_disabled from public.app_settings a limit 1), false) then return null; end if;
  select * into c from public.iptv_customers where share_token = p_token and share_enabled;
  if not found then return null; end if;
  return public.iptv_customer_view(c);
end;
$$;

-- A signed-in client: every customer record linked to their login (normally one), each with all its subscriptions
create or replace function public.my_iptv_subscriptions()
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'not_signed_in' using errcode = '42501'; end if;
  if coalesce((select a.client_links_disabled from public.app_settings a limit 1), false) then return '[]'::jsonb; end if;
  return coalesce((select jsonb_agg(public.iptv_customer_view(c) order by c.created_at) from public.iptv_customers c where c.client_user_id = auth.uid()), '[]'::jsonb);
end;
$$;

revoke all on function public.iptv_create_link(uuid) from public, anon;
revoke all on function public.iptv_stop_link(uuid) from public, anon;
revoke all on function public.iptv_link_user(uuid, text) from public, anon;
revoke all on function public.iptv_unlink_user(uuid) from public, anon;
revoke all on function public.iptv_subscription_shape(public.iptv_clients) from public, anon, authenticated;
revoke all on function public.iptv_customer_view(public.iptv_customers) from public, anon, authenticated;
revoke all on function public.iptv_public_view(text) from public, anon, authenticated;
revoke all on function public.my_iptv_subscriptions() from public, anon;
grant execute on function public.iptv_create_link(uuid) to authenticated;
grant execute on function public.iptv_stop_link(uuid) to authenticated;
grant execute on function public.iptv_link_user(uuid, text) to authenticated;
grant execute on function public.iptv_unlink_user(uuid) to authenticated;
grant execute on function public.my_iptv_subscriptions() to authenticated;
grant execute on function public.iptv_public_view(text) to service_role;
grant execute on function public.iptv_subscription_shape(public.iptv_clients) to service_role;
grant execute on function public.iptv_customer_view(public.iptv_customers) to service_role;

notify pgrst, 'reload schema';
