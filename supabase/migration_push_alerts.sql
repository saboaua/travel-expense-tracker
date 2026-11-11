-- Migration 50: Phone alerts, more precise messages and more kinds.
-- Run in the Supabase SQL Editor (safe to run more than once). Needs migration_sharing_safety.sql first.
--  * push_sent_log  remembers which reminders were already sent (a flight tomorrow, a trip that ended, a document step), so none comes twice.
--  * push_queue     keeps alerts that arrive during a person's quiet hours; the next daily run sends them in the morning.
-- Both tables are only used by the server (the service key). Nobody can read them from the app.

create table if not exists public.push_sent_log (
  user_id uuid not null references public.profiles(id) on delete cascade,
  dedupe_key text not null check (char_length(dedupe_key) <= 200),
  sent_at timestamptz not null default now(),
  primary key (user_id, dedupe_key)
);
create index if not exists push_sent_log_sent_idx on public.push_sent_log (sent_at);

create table if not exists public.push_queue (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  kind text not null,
  pref text,
  data jsonb,
  created_at timestamptz not null default now()
);
create index if not exists push_queue_user_idx on public.push_queue (user_id, created_at);

alter table public.push_sent_log enable row level security;
alter table public.push_queue enable row level security;
revoke all on public.push_sent_log from anon, authenticated;
revoke all on public.push_queue from anon, authenticated;

-- The saved choices (profiles.push_prefs) gain new keys by themselves; nothing to change for people who already saved some.
notify pgrst, 'reload schema';
