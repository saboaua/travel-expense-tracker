-- Migration 66: Bill emails, only your account numbers. The same companies also bill other people (a parent's account), so each allowed
-- sender can list the account numbers that are yours; bills for any other account are skipped. An empty list adds everything from that sender.
-- Run in the Supabase SQL Editor (safe to run more than once). Needs migration_bill_emails.sql first.

alter table public.bill_email_senders add column if not exists accounts text[] not null default '{}';
alter table public.bill_email_senders drop constraint if exists bill_email_senders_accounts_check;
alter table public.bill_email_senders add constraint bill_email_senders_accounts_check
  check (cardinality(accounts) <= 20 and char_length(array_to_string(accounts, ',')) <= 600);

-- the account number an email was for, so a skipped one can be added to your list with one tap
alter table public.bill_email_log add column if not exists account text check (account is null or char_length(account) <= 40);

-- a new log status for "not one of your accounts"
alter table public.bill_email_log drop constraint if exists bill_email_log_status_check;
alter table public.bill_email_log add constraint bill_email_log_status_check
  check (status in ('added', 'skipped_duplicate', 'ignored_sender', 'wrong_account', 'unreadable', 'confirmation'));

notify pgrst, 'reload schema';
