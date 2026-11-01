-- Dynamic expense categories. Admins manage them.
-- Run in the Supabase SQL Editor.

create table if not exists public.categories (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  enabled boolean not null default true,
  sort_order int not null default 100,
  created_at timestamptz default now()
);

insert into public.categories (name, sort_order) values
  ('Meals', 1),
  ('Transport', 2),
  ('Lodging', 3),
  ('Fuel', 4),
  ('Office Supplies', 5),
  ('Entertainment', 6),
  ('Other', 99)
on conflict (name) do nothing;

alter table public.categories enable row level security;

drop policy if exists "Authenticated can read categories" on public.categories;
create policy "Authenticated can read categories"
  on public.categories for select
  to authenticated
  using (true);

drop policy if exists "Admins manage categories" on public.categories;
create policy "Admins manage categories"
  on public.categories for all
  to authenticated
  using (exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'admin'
  ))
  with check (exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'admin'
  ));

notify pgrst, 'reload schema';
