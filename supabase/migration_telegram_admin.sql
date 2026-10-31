-- Admin-managed Telegram credentials
-- Run in Supabase SQL Editor
--
-- Secrets live in their own table with RLS and no client policies.
-- Only the service role (webhook / admin API) can read them.
-- Never select these columns from the browser client.

create table if not exists public.app_secrets (
  id int primary key default 1 check (id = 1),
  telegram_bot_token text,
  telegram_webhook_secret text,
  updated_at timestamptz default now()
);

insert into public.app_secrets (id)
values (1)
on conflict (id) do nothing;

alter table public.app_secrets enable row level security;

-- No policies on purpose: authenticated and anon cannot read or write.
