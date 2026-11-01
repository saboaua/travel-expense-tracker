-- Admin-managed travel categories (shown as buttons when creating/editing a trip)
-- plus an optional icon for expense categories (shown as buttons when adding a receipt).
-- Run in the Supabase SQL Editor.

create table if not exists public.travel_categories (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  icon text not null default 'briefcase',
  enabled boolean not null default true,
  sort_order int not null default 100,
  created_at timestamptz default now()
);

insert into public.travel_categories (name, icon, sort_order) values
  ('Client Meeting', 'users', 1),
  ('Conference', 'building', 2),
  ('Strategy Session', 'map-pin', 3),
  ('Internal Review', 'file-text', 4)
on conflict (name) do nothing;

alter table public.travel_categories enable row level security;

drop policy if exists "Authenticated can read travel categories" on public.travel_categories;
create policy "Authenticated can read travel categories"
  on public.travel_categories for select
  to authenticated
  using (true);

drop policy if exists "Admins manage travel categories" on public.travel_categories;
create policy "Admins manage travel categories"
  on public.travel_categories for all
  to authenticated
  using (exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'admin'
  ))
  with check (exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'admin'
  ));

-- Icons for expense categories
alter table public.categories add column if not exists icon text;

update public.categories set icon = 'utensils'  where name = 'Meals'           and icon is null;
update public.categories set icon = 'car'       where name = 'Transport'       and icon is null;
update public.categories set icon = 'bed'       where name = 'Lodging'         and icon is null;
update public.categories set icon = 'fuel'      where name = 'Fuel'            and icon is null;
update public.categories set icon = 'paperclip' where name = 'Office Supplies' and icon is null;
update public.categories set icon = 'ticket'    where name = 'Entertainment'   and icon is null;
update public.categories set icon = 'tag'       where name = 'Other'           and icon is null;

notify pgrst, 'reload schema';
