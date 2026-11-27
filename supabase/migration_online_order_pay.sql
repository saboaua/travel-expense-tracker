-- How forwarded online orders (Amazon, AliExpress, eBay) are paid by default. One row per person; no row means credit card.
create table if not exists public.online_order_prefs (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  paid_with text not null default 'credit' check (paid_with in ('cash', 'debit', 'credit')),
  updated_at timestamptz not null default now()
);
alter table public.online_order_prefs enable row level security;
drop policy if exists "Own online order prefs" on public.online_order_prefs;
create policy "Own online order prefs" on public.online_order_prefs
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));
