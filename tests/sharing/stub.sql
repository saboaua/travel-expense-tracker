-- Minimal stand-in for the Supabase pieces that supabase/migration_sharing.sql depends on (test only).
create role anon nologin;
create role authenticated nologin;
create role service_role nologin;
create schema auth;
create table auth.users (id uuid primary key default gen_random_uuid(), email text);
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;

create table public.profiles (id uuid primary key references auth.users(id) on delete cascade, first_name text, email text, role text not null default 'user');
create table public.roles (key text primary key, permissions text[] not null default '{}');
create table public.app_settings (id int primary key, sharing_disabled boolean not null default false);
insert into public.app_settings (id) values (1);
create table public.security_events (
  id uuid primary key default gen_random_uuid(), event_type text not null,
  severity text not null default 'info' check (severity in ('info', 'warning', 'critical')),
  email_attempted text, user_id uuid references public.profiles(id) on delete set null,
  details jsonb default '{}'::jsonb, created_at timestamptz not null default now());

create table public.loyalty_cards (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
  store_name text not null, holder_name text, category text, card_number text not null,
  barcode_format text not null default 'CODE128', color text, image_path text, notes_secret text);
create table public.trips (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
  name text not null, destination text, start_date date, end_date date, status text default 'active', budget numeric, notes text);
create table public.expenses (
  id uuid primary key default gen_random_uuid(), trip_id uuid not null references public.trips(id) on delete cascade,
  user_id uuid not null, merchant text, amount numeric, receipt_path text);
create table public.personal_projects (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null check (kind in ('home_project', 'personal_trip')), name text not null, destination text,
  start_date date, end_date date, budget numeric);

create function public.has_permission(p text) returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles pr join public.roles r on r.key = pr.role
                 where pr.id = auth.uid() and (pr.role = 'admin' or p = any (r.permissions)))
$$;

-- Supabase grants these by default; the migration must take them away from its own tables
grant usage on schema public, auth to anon, authenticated, service_role;
grant all on all tables in schema public to anon, authenticated, service_role;
grant execute on all functions in schema public to anon, authenticated, service_role;
