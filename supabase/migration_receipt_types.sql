-- Receipt types: your own kinds of receipt (Personal care, Health, Pets...) besides Groceries and Shopping.
-- Run once in the Supabase SQL Editor. Safe to run again. Nothing existing is changed or deleted.
-- 1) receipt_types: one row per type you create (name, icon, colour, whether it gets its own line in the monthly budget, optional monthly limit).
-- 2) grocery_receipts gets a type_id, and its area may now also be 'other' (a receipt of one of your own types).

create table if not exists public.receipt_types (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 40),
  icon text not null default 'tag' check (char_length(icon) <= 30),
  color text not null default '#475569' check (color ~ '^#[0-9a-fA-F]{6}$'),
  show_in_budget boolean not null default true,
  monthly_limit numeric(12,2) check (monthly_limit is null or monthly_limit > 0),
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);
create unique index if not exists receipt_types_user_name_idx on public.receipt_types (user_id, lower(btrim(name)));

alter table public.receipt_types enable row level security;
drop policy if exists "Receipt types own select" on public.receipt_types;
create policy "Receipt types own select" on public.receipt_types for select to authenticated using (user_id = auth.uid());
drop policy if exists "Receipt types own insert" on public.receipt_types;
create policy "Receipt types own insert" on public.receipt_types for insert to authenticated with check (user_id = auth.uid());
drop policy if exists "Receipt types own update" on public.receipt_types;
create policy "Receipt types own update" on public.receipt_types for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists "Receipt types own delete" on public.receipt_types;
create policy "Receipt types own delete" on public.receipt_types for delete to authenticated using (user_id = auth.uid());

-- A receipt of one of your own types: area 'other' plus the type. Deleting a type keeps its receipts: the app moves them back to Groceries first.
alter table public.grocery_receipts add column if not exists type_id uuid references public.receipt_types (id) on delete set null;
do $$ begin
  if exists (select 1 from pg_constraint where conname = 'grocery_receipts_area_check') then
    alter table public.grocery_receipts drop constraint grocery_receipts_area_check;
  end if;
  alter table public.grocery_receipts add constraint grocery_receipts_area_check check (area in ('groceries', 'shopping', 'other'));
end $$;
create index if not exists grocery_receipts_type_idx on public.grocery_receipts (type_id) where type_id is not null;

notify pgrst, 'reload schema';
