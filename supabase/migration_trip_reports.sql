-- Business trip reports as a Pro feature: Free keeps the receipt photos, Pro has the Excel and the report ZIP.
-- Run once in the Supabase SQL Editor, after migration_limit_starts.sql. Safe to run again.
-- Empty start day = off: everyone keeps Excel and ZIP exactly as today. Set the day on the admin Limits page.

alter table public.pro_limits add column if not exists starts_trip_reports date;

notify pgrst, 'reload schema';
