-- Receipt country: where a receipt or a price note was bought, so its prices go to that country's community.
-- Run once in the Supabase SQL Editor. Safe to run again. Needs migration_country.sql and migration_price_notes.sql.
-- Nothing changes for receipts already saved: they have no country and keep the old rule (the currency, or the country you were in).

alter table public.grocery_receipts add column if not exists country text check (country is null or country ~ '^[A-Z]{2}$');
alter table public.price_checks add column if not exists country text check (country is null or country ~ '^[A-Z]{2}$');
