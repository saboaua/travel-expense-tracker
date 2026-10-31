-- Multi-currency expenses with a frozen USD conversion
-- Run in Supabase SQL Editor

alter table public.expenses
  add column if not exists exchange_rate numeric(16, 6),
  add column if not exists amount_usd numeric(12, 2);

update public.expenses
set currency = coalesce(nullif(currency, ''), 'USD')
where currency is null or currency = '';

update public.expenses
set
  exchange_rate = 1,
  amount_usd = amount
where (currency is null or currency = 'USD')
  and amount_usd is null;

notify pgrst, 'reload schema';
