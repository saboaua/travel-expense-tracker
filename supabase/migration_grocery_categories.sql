-- Admin-managed grocery categories (used on grocery receipt items and the AI scan).
-- Run in the Supabase SQL Editor.

create table if not exists public.grocery_categories (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  icon text not null default 'shopping-basket',
  enabled boolean not null default true,
  sort_order int not null default 100,
  created_at timestamptz default now()
);

insert into public.grocery_categories (name, icon, sort_order) values
  ('Produce', 'apple', 1),
  ('Meat & Seafood', 'beef', 2),
  ('Dairy & Eggs', 'milk', 3),
  ('Bakery', 'croissant', 4),
  ('Pantry', 'wheat', 5),
  ('Beverages', 'cup-soda', 6),
  ('Snacks', 'cookie', 7),
  ('Frozen', 'snowflake', 8),
  ('Household', 'spray-can', 9),
  ('Personal Care', 'droplets', 10),
  ('Other', 'tag', 99)
on conflict (name) do nothing;

alter table public.grocery_categories enable row level security;

drop policy if exists "Authenticated can read grocery categories" on public.grocery_categories;
create policy "Authenticated can read grocery categories"
  on public.grocery_categories for select
  to authenticated
  using (true);

drop policy if exists "Admins manage grocery categories" on public.grocery_categories;
create policy "Admins manage grocery categories"
  on public.grocery_categories for all
  to authenticated
  using (exists (select 1 from public.profiles where id = auth.uid() and role = 'admin'))
  with check (exists (select 1 from public.profiles where id = auth.uid() and role = 'admin'));

notify pgrst, 'reload schema';
