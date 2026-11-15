-- Pro plan limits. Run once in the Supabase SQL Editor, after migration_pro_payments.sql. Safe to run again.
-- The admin sets every number and switch under Admin, Pro plan limits. Nothing people already saved is removed.

create table if not exists public.pro_limits (
  id int primary key default 1 check (id = 1),
  starts_on date,
  free_ai_scans int not null default 10 check (free_ai_scans between 0 and 1000),
  free_documents int not null default 2 check (free_documents between 0 and 1000),
  pro_documents int not null default 100 check (pro_documents between 1 and 10000),
  pro_bills_email boolean not null default true,
  pro_telegram_save boolean not null default true,
  pro_telegram_summary boolean not null default true,
  pro_doc_reminders boolean not null default true,
  updated_at timestamptz not null default now()
);
alter table public.pro_limits enable row level security;
drop policy if exists "Anyone signed in can read the limits" on public.pro_limits;
create policy "Anyone signed in can read the limits" on public.pro_limits for select to authenticated using (true);
insert into public.pro_limits (id) values (1) on conflict (id) do nothing;

-- AI scans used this month, one row per person and month. Only the server writes it.
create table if not exists public.ai_scan_usage (
  user_id uuid not null references auth.users(id) on delete cascade,
  month text not null check (month ~ '^\d{4}-\d{2}$'),
  count int not null default 0 check (count >= 0),
  primary key (user_id, month)
);
alter table public.ai_scan_usage enable row level security;
drop policy if exists "Read own scan count" on public.ai_scan_usage;
create policy "Read own scan count" on public.ai_scan_usage for select to authenticated using (user_id = auth.uid());

-- Bills that arrived by email while the person was on Free. They are added once Pro is on. Only the server reads this.
create table if not exists public.bill_email_held (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  payload jsonb not null,
  created_at timestamptz not null default now()
);
create index if not exists bill_email_held_user_idx on public.bill_email_held (user_id, created_at);
alter table public.bill_email_held enable row level security;

alter table public.bill_email_log drop constraint if exists bill_email_log_status_check;
alter table public.bill_email_log add constraint bill_email_log_status_check
  check (status in ('added', 'skipped_duplicate', 'ignored_sender', 'wrong_account', 'unreadable', 'confirmation', 'needs_pro'));

notify pgrst, 'reload schema';
