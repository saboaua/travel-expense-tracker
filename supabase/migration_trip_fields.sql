-- Add destination and travel category to trips
-- Run this in your Supabase SQL Editor

alter table public.trips
  add column if not exists destination text;

alter table public.trips
  add column if not exists category text;

-- Optional: index for filtering
create index if not exists idx_trips_status on public.trips(status);
