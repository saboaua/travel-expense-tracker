-- Paid with (cash, debit card, credit card) on personal expenses and receipts, and an optional trip on a receipt
-- so personal shopping done during a work trip can be filtered by card and by destination.
-- trip_ref is "trip:<id>" (a business trip) or "ptrip:<id>" (a personal trip). It is a label only: it never adds to a business trip's totals.
alter table public.personal_expenses add column if not exists paid_with text;
alter table public.grocery_receipts add column if not exists paid_with text;
alter table public.grocery_receipts add column if not exists trip_ref text;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'personal_expenses_paid_with_check') then
    alter table public.personal_expenses add constraint personal_expenses_paid_with_check check (paid_with is null or paid_with in ('cash', 'debit', 'credit'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'grocery_receipts_paid_with_check') then
    alter table public.grocery_receipts add constraint grocery_receipts_paid_with_check check (paid_with is null or paid_with in ('cash', 'debit', 'credit'));
  end if;
end $$;

create index if not exists grocery_receipts_trip_ref_idx on public.grocery_receipts (user_id, trip_ref) where trip_ref is not null;
