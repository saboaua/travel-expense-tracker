-- Telegram, part 2: message settings, a log so the same message is never sent twice,
-- and room to undo the last upload. Run once in the Supabase SQL Editor.

-- Per-person message settings
create table if not exists public.telegram_notify_prefs (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  enabled boolean not null default true,
  trip_reminders boolean not null default true,
  admin_alerts boolean not null default true,
  quiet_start smallint not null default 22 check (quiet_start between 0 and 23),
  quiet_end smallint not null default 7 check (quiet_end between 0 and 23),
  tz text not null default 'America/Aruba',
  last_choice text,
  updated_at timestamptz not null default now()
);
alter table public.telegram_notify_prefs enable row level security;

drop policy if exists "Own telegram prefs read" on public.telegram_notify_prefs;
create policy "Own telegram prefs read" on public.telegram_notify_prefs
  for select using (auth.uid() = user_id);
drop policy if exists "Own telegram prefs insert" on public.telegram_notify_prefs;
create policy "Own telegram prefs insert" on public.telegram_notify_prefs
  for insert with check (auth.uid() = user_id);
drop policy if exists "Own telegram prefs update" on public.telegram_notify_prefs;
create policy "Own telegram prefs update" on public.telegram_notify_prefs
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- What was sent, so a reminder or alert goes out once. Only the server (service role) reads and writes it.
create table if not exists public.telegram_sent_log (
  id bigserial primary key,
  user_id uuid not null references public.profiles(id) on delete cascade,
  kind text not null,
  dedupe_key text not null,
  sent_at timestamptz not null default now(),
  unique (user_id, kind, dedupe_key)
);
alter table public.telegram_sent_log enable row level security;
create index if not exists telegram_sent_log_sent_at_idx on public.telegram_sent_log (sent_at);

-- Remember the last upload so "Change" can move it somewhere else (reference like "expenses:<id>")
alter table public.telegram_pending add column if not exists saved_ref text;
alter table public.telegram_pending add column if not exists saved_path text;
