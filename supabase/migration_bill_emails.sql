-- Migration 65: Bill emails (Utilities). Forward a utility company's "your bill is ready" email to a private address and it is added to your Due list.
-- Run in the Supabase SQL Editor (safe to run more than once). Needs migration_utilities.sql first.
-- The server (using the service role key) fills utility_bills and bill_email_log when an email arrives; you manage your address and senders in the app.

-- 1. Where a bill came from, and a mark for "check this" (a guessed month, or no amount in the email)
alter table public.utility_bills add column if not exists source text check (source is null or source in ('email'));
alter table public.utility_bills add column if not exists dedupe_key text check (dedupe_key is null or char_length(dedupe_key) <= 200);
alter table public.utility_bills add column if not exists needs_check boolean not null default false;
create unique index if not exists utility_bills_dedupe_idx on public.utility_bills (user_id, dedupe_key) where dedupe_key is not null;

-- 2. One private forwarding address per person (the token is the secret part of it)
create table if not exists public.bill_email_addresses (
  user_id uuid primary key references auth.users(id) on delete cascade,
  token text not null unique check (char_length(token) between 16 and 64),
  created_at timestamptz not null default now()
);
alter table public.bill_email_addresses enable row level security;
drop policy if exists "Own bill email address" on public.bill_email_addresses;
create policy "Own bill email address" on public.bill_email_addresses
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- 3. The senders you allow: mail from anyone else is ignored
create table if not exists public.bill_email_senders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 80),
  email text not null check (char_length(email) between 3 and 200 and email = lower(email)),
  created_at timestamptz not null default now(),
  unique (user_id, email)
);
alter table public.bill_email_senders enable row level security;
drop policy if exists "Own bill email senders" on public.bill_email_senders;
create policy "Own bill email senders" on public.bill_email_senders
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- 4. What arrived and what happened to it. You can read and clear it; only the server writes it.
create table if not exists public.bill_email_log (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  sender text check (sender is null or char_length(sender) <= 200),
  subject text check (subject is null or char_length(subject) <= 200),
  status text not null check (status in ('added', 'skipped_duplicate', 'ignored_sender', 'unreadable', 'confirmation')),
  summary text check (summary is null or char_length(summary) <= 300),
  code text check (code is null or char_length(code) <= 20),
  bill_id uuid references public.utility_bills(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists bill_email_log_user_idx on public.bill_email_log (user_id, created_at desc);
alter table public.bill_email_log enable row level security;
drop policy if exists "Read own bill email log" on public.bill_email_log;
create policy "Read own bill email log" on public.bill_email_log for select to authenticated using (user_id = (select auth.uid()));
drop policy if exists "Clear own bill email log" on public.bill_email_log;
create policy "Clear own bill email log" on public.bill_email_log for delete to authenticated using (user_id = (select auth.uid()));

notify pgrst, 'reload schema';
