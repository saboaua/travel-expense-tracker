-- Migration 52: Do it Aruba as a third online store (admins import its prices from an exported Excel file).
-- Run in the Supabase SQL Editor (safe to run more than once). Needs migration_store_prices.sql first.
-- Only the store check lists change: they now also allow 'doit'. Nothing else is touched.

alter table public.store_catalog drop constraint if exists store_catalog_store_check;
alter table public.store_catalog add constraint store_catalog_store_check check (store in ('superfood', 'ling', 'doit'));

alter table public.grocery_online_matches drop constraint if exists grocery_online_matches_store_check;
alter table public.grocery_online_matches add constraint grocery_online_matches_store_check check (store in ('superfood', 'ling', 'doit'));
