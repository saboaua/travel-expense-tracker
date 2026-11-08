-- Remember which notices a person closed, on their account instead of only on one device.
-- Run in the Supabase SQL Editor (safe to run more than once).
--
-- Before this, the bell and the passport banner remembered "hidden for a week" in the phone's browser storage.
-- Removing the app from the home screen and adding it back (for example to get a new icon) clears that storage,
-- so closed notices came back. The app now keeps the list here and uses the phone only as a fast copy.
-- Each person can read and change only their own row (the existing "update own profile" policy already covers it).

alter table public.profiles add column if not exists dismissed_notices jsonb not null default '{}'::jsonb;

notify pgrst, 'reload schema';
