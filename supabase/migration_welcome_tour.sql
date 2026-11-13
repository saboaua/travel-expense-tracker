-- Welcome tour: a popup shown once to new people, and the picks they made in it.
-- Run once in the Supabase SQL Editor. Safe to run again.
alter table public.profiles add column if not exists welcome_seen_at timestamptz;
alter table public.profiles add column if not exists welcome_tracks text[];

-- Everyone who already has an account is treated as having seen it, so only new sign-ups get the popup.
update public.profiles set welcome_seen_at = now() where welcome_seen_at is null;
