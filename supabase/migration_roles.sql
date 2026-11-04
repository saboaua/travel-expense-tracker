-- Custom roles and per-feature access.
-- Run in the Supabase SQL Editor (safe to run more than once).
--
-- * public.roles holds every role (user / assistant / admin plus any role an admin creates)
-- * permissions = feature keys the role can use (the list of features lives in src/lib/access.ts)
-- * known_features = features an admin has already reviewed for that role; a feature added to the app
--   later shows up as "New" in Admin > Roles until it is reviewed
-- * admin is implicit full access and cannot be edited or deleted

create table if not exists public.roles (
  key text primary key check (key ~ '^[a-z][a-z0-9-]{1,29}$'),
  label text not null check (char_length(label) between 1 and 40),
  description text check (description is null or char_length(description) <= 200),
  permissions text[] not null default '{}',
  known_features text[] not null default '{}',
  is_system boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- The three existing roles. Permissions match how they behaved before (admin = everything, implicit).
insert into public.roles (key, label, description, permissions, known_features, is_system) values
  ('user', 'User', 'Dashboard, trips, reports, personal and documents.',
    array['trips','reports','personal','documents'],
    array['trips','reports','personal','documents','users.manage','security.view','categories.manage','currencies.manage','branding.manage','telegram.manage','support.view'], true),
  ('assistant', 'Assistant', 'Same as User, and can create users (not roles).',
    array['trips','reports','personal','documents','users.manage'],
    array['trips','reports','personal','documents','users.manage','security.view','categories.manage','currencies.manage','branding.manage','telegram.manage','support.view'], true),
  ('admin', 'Admin', 'Full access to everything.', '{}', '{}', true)
on conflict (key) do nothing;

-- Roles are read by every signed-in user (to build their menu). Only the server (service role) writes them.
alter table public.roles enable row level security;
drop policy if exists "Authenticated can read roles" on public.roles;
create policy "Authenticated can read roles" on public.roles for select to authenticated using (true);

-- profiles.role may now be any role key
alter table public.profiles drop constraint if exists profiles_role_check;
alter table public.profiles drop constraint if exists profiles_role_fkey;
alter table public.profiles
  add constraint profiles_role_fkey foreign key (role) references public.roles(key) on update cascade;

-- Does the signed-in user have this feature? Admin always does.
create or replace function public.has_permission(p text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles pr
    join public.roles r on r.key = pr.role
    where pr.id = auth.uid()
      and (pr.role = 'admin' or p = any (r.permissions))
  );
$$;
revoke all on function public.has_permission(text) from public;
grant execute on function public.has_permission(text) to authenticated;

-- Move the admin-only table policies onto has_permission so those features can be delegated to a role.
do $$
begin
  if to_regclass('public.categories') is not null then
    drop policy if exists "Admins manage categories" on public.categories;
    create policy "Admins manage categories" on public.categories for all to authenticated
      using (public.has_permission('categories.manage')) with check (public.has_permission('categories.manage'));
  end if;

  if to_regclass('public.travel_categories') is not null then
    drop policy if exists "Admins manage travel categories" on public.travel_categories;
    create policy "Admins manage travel categories" on public.travel_categories for all to authenticated
      using (public.has_permission('categories.manage')) with check (public.has_permission('categories.manage'));
  end if;

  if to_regclass('public.grocery_categories') is not null then
    drop policy if exists "Admins manage grocery categories" on public.grocery_categories;
    create policy "Admins manage grocery categories" on public.grocery_categories for all to authenticated
      using (public.has_permission('categories.manage')) with check (public.has_permission('categories.manage'));
  end if;

  if to_regclass('public.currencies') is not null then
    drop policy if exists "Admins manage currencies" on public.currencies;
    create policy "Admins manage currencies" on public.currencies for all to authenticated
      using (public.has_permission('currencies.manage')) with check (public.has_permission('currencies.manage'));
  end if;

  if to_regclass('public.app_settings') is not null then
    drop policy if exists "Admins can insert app settings" on public.app_settings;
    create policy "Admins can insert app settings" on public.app_settings for insert to authenticated
      with check (public.has_permission('branding.manage'));
    drop policy if exists "Admins can update app settings" on public.app_settings;
    create policy "Admins can update app settings" on public.app_settings for update to authenticated
      using (public.has_permission('branding.manage')) with check (public.has_permission('branding.manage'));
  end if;

  if to_regclass('public.support_requests') is not null then
    drop policy if exists "Admins read support requests" on public.support_requests;
    create policy "Admins read support requests" on public.support_requests for select to authenticated
      using (public.has_permission('support.view'));
    drop policy if exists "Admins update support requests" on public.support_requests;
    create policy "Admins update support requests" on public.support_requests for update to authenticated
      using (public.has_permission('support.view')) with check (public.has_permission('support.view'));
    drop policy if exists "Admins delete support requests" on public.support_requests;
    create policy "Admins delete support requests" on public.support_requests for delete to authenticated
      using (public.has_permission('support.view'));
  end if;
end $$;

-- Logo uploads
drop policy if exists "Admins can upload branding" on storage.objects;
create policy "Admins can upload branding" on storage.objects for insert to authenticated
  with check (bucket_id = 'branding' and public.has_permission('branding.manage'));
drop policy if exists "Admins can update branding" on storage.objects;
create policy "Admins can update branding" on storage.objects for update to authenticated
  using (bucket_id = 'branding' and public.has_permission('branding.manage'));

notify pgrst, 'reload schema';
