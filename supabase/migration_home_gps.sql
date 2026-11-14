-- Home place GPS point: lets Best store measure distance from your home when location is off.
-- Saved rounded to about 100 m. Only you can read it (the profile rules already say so). Run once in the Supabase SQL Editor.
alter table public.profiles add column if not exists home_lat double precision check (home_lat between -90 and 90);
alter table public.profiles add column if not exists home_lng double precision check (home_lng between -180 and 180);
