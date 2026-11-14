-- Sorting receipt lines: more categories, which part of the budget each one counts in, and remembered choices.
-- Run in the Supabase SQL Editor. Safe to run more than once. Needs migration_grocery_categories.sql first.

-- 1. Which part of the budget a category counts in: groceries (default) or shopping
alter table public.grocery_categories add column if not exists area text not null default 'groceries';
alter table public.grocery_categories drop constraint if exists grocery_categories_area_check;
alter table public.grocery_categories add constraint grocery_categories_area_check check (area in ('groceries', 'shopping'));

-- 2. New categories (rename or hide them in Admin > Receipt Categories > Grocery)
insert into public.grocery_categories (name, icon, sort_order, area) values
  ('Pet',               'tag',       11, 'groceries'),
  ('Stationery & art',  'paperclip', 12, 'shopping'),
  ('Clothing',          'shopping',  13, 'shopping'),
  ('Electronics',       'plug',      14, 'shopping'),
  ('Toys & games',      'gift',      15, 'shopping'),
  ('Garden & hardware', 'hammer',    16, 'shopping'),
  ('Shopping',          'shopping',  17, 'shopping')
on conflict (name) do nothing;
-- if a category by one of these names was added by hand earlier, make sure the shopping ones count as shopping
update public.grocery_categories set area = 'shopping'
 where name in ('Stationery & art', 'Clothing', 'Electronics', 'Toys & games', 'Garden & hardware', 'Shopping');

-- 3. A person's own choices: this product is always this category for me
create table if not exists public.grocery_item_rules (
  user_id uuid not null references auth.users(id) on delete cascade,
  normalized_name text not null check (char_length(normalized_name) between 1 and 160),
  category text not null check (char_length(category) between 1 and 60),
  updated_at timestamptz not null default now(),
  primary key (user_id, normalized_name)
);
alter table public.grocery_item_rules enable row level security;
drop policy if exists "Own item rules" on public.grocery_item_rules;
create policy "Own item rules" on public.grocery_item_rules for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

notify pgrst, 'reload schema';
