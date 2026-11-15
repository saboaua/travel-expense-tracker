-- Utilities: the payment reference number of a bill you paid online.
-- Run in the Supabase SQL Editor (safe to run more than once). Needs migration_utilities.sql first.
alter table public.utility_bills add column if not exists payment_ref text check (payment_ref is null or char_length(payment_ref) <= 80);
