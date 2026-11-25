-- Online orders: which site a receipt came from (Amazon, AliExpress, eBay…) and when it arrives.
-- Run once in the Supabase SQL Editor. Safe to run again. Nothing changes for receipts already saved.
-- An online receipt counts in your budget like any other, but its prices are never shared with a country's community.

alter table public.grocery_receipts add column if not exists online_site text check (online_site is null or online_site in ('amazon','aliexpress','ebay','other'));
alter table public.grocery_receipts add column if not exists arrives_on date;
