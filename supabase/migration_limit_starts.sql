-- Each limit gets its own start day, and two new Free limits (sharing loyalty cards, trip papers).
-- Run once in the Supabase SQL Editor, after migration_pro_limits.sql. Safe to run again.
-- Empty start day = that limit is off. The single "starts_on" day is copied to every limit that was on, then cleared.

alter table public.pro_limits add column if not exists starts_ai_scans date;
alter table public.pro_limits add column if not exists starts_documents date;
alter table public.pro_limits add column if not exists starts_bills_email date;
alter table public.pro_limits add column if not exists starts_telegram_save date;
alter table public.pro_limits add column if not exists starts_telegram_summary date;
alter table public.pro_limits add column if not exists starts_doc_reminders date;
alter table public.pro_limits add column if not exists starts_card_sharing date;
alter table public.pro_limits add column if not exists starts_trip_papers date;
alter table public.pro_limits add column if not exists free_shared_cards int not null default 1 check (free_shared_cards between 0 and 1000);
alter table public.pro_limits add column if not exists free_trip_papers int not null default 3 check (free_trip_papers between 0 and 1000);
alter table public.pro_limits add column if not exists pro_trip_papers int not null default 50 check (pro_trip_papers between 1 and 10000);

update public.pro_limits set
  starts_ai_scans = starts_on,
  starts_documents = starts_on,
  starts_bills_email = case when pro_bills_email then starts_on end,
  starts_telegram_save = case when pro_telegram_save then starts_on end,
  starts_telegram_summary = case when pro_telegram_summary then starts_on end,
  starts_doc_reminders = case when pro_doc_reminders then starts_on end,
  starts_on = null
where id = 1 and starts_on is not null;
