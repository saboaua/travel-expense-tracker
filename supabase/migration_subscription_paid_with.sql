-- How each subscription is paid: Credit card (the default), Debit card or Cash. Run once in the Supabase SQL Editor. Safe to run again.
-- Your current subscriptions become Credit card; change any that are not on the Subscriptions page.

alter table public.subscriptions add column if not exists paid_with text not null default 'credit';

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'subscriptions_paid_with_check') then
    alter table public.subscriptions add constraint subscriptions_paid_with_check check (paid_with in ('cash', 'debit', 'credit'));
  end if;
end $$;

notify pgrst, 'reload schema';
