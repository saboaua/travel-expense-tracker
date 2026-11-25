-- Forwarding online order emails as a Pro feature: Free keeps photo, upload and adding by hand.
-- Run once in the Supabase SQL Editor, after migration_limit_starts.sql. Safe to run again.
-- Until this is run the limit is on from 1 Jan 2026 (Pro only). The admin Limits page can move the day or switch it off.

alter table public.pro_limits add column if not exists starts_orders_email date;

notify pgrst, 'reload schema';
