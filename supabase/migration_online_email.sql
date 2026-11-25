-- Online orders by email: forward an Amazon, AliExpress or eBay order email to your private address and it is added as an online receipt.
-- Run once in the Supabase SQL Editor. Safe to run again. Needs migration_online_orders.sql and migration_bill_emails.sql first.
-- order_ref stops the same order being added twice; needs_check marks an order read from an email until you have looked at it and saved it.

alter table public.grocery_receipts add column if not exists order_ref text check (order_ref is null or char_length(order_ref) <= 60);
alter table public.grocery_receipts add column if not exists source text check (source is null or source in ('email'));
alter table public.grocery_receipts add column if not exists needs_check boolean not null default false;
create unique index if not exists grocery_receipts_order_ref_idx on public.grocery_receipts (user_id, order_ref) where order_ref is not null;

notify pgrst, 'reload schema';
