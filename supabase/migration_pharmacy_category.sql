-- Adds the Pharmacy category to receipt lines (counts as Shopping in the budget).
-- Run in the Supabase SQL Editor after migration_shopping_categories.sql. Safe to run more than once.
insert into public.grocery_categories (name, icon, sort_order, area) values ('Pharmacy', 'pill', 18, 'shopping')
on conflict (name) do nothing;
update public.grocery_categories set area = 'shopping' where name = 'Pharmacy';
