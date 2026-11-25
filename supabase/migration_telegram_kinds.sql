-- Telegram: one switch for every alert. Run once in the Supabase SQL Editor.
-- Until you run it, Telegram keeps working as before (trip reminders, document expiry, weekly summary, admin alerts)
-- and the new Telegram switches in Profile > Notifications cannot be saved.
alter table public.telegram_notify_prefs add column if not exists kinds jsonb not null default '{}'::jsonb;
