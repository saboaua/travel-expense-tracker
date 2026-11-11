-- Hotel name and address on a trip (shown on the trip page with a Directions button).
-- Run this in your Supabase SQL Editor. Safe to run more than once.

alter table public.trips
  add column if not exists hotel_name text,
  add column if not exists hotel_address text;
