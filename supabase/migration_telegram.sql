-- Telegram receipt upload
-- Run in Supabase SQL Editor

alter table public.app_settings
  add column if not exists telegram_enabled boolean default false,
  add column if not exists telegram_bot_username text;

update public.app_settings
set telegram_bot_username = coalesce(telegram_bot_username, 'travelexpenseassistant_bot')
where id = 1;

alter table public.profiles
  add column if not exists telegram_id bigint,
  add column if not exists telegram_link_code text,
  add column if not exists telegram_link_expires timestamptz,
  add column if not exists telegram_default_trip_id uuid references public.trips(id) on delete set null;

create unique index if not exists profiles_telegram_id_key
  on public.profiles (telegram_id)
  where telegram_id is not null;

create table if not exists public.telegram_pending (
  telegram_id bigint primary key,
  file_id text not null,
  file_name text,
  mime text,
  created_at timestamptz default now()
);

alter table public.telegram_pending enable row level security;
-- No client policies: webhook uses the service role only.
