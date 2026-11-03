-- Personal section: groceries, home projects and personal travel.
-- All rows are private to their owner (no admin policies on purpose).
-- Run in the Supabase SQL Editor. Safe to run more than once.

-- Optional switch so an admin can hide the section for the whole app
alter table public.app_settings
  add column if not exists personal_enabled boolean not null default true;

-- Home projects and personal trips share one "container with a budget" table
create table if not exists public.personal_projects (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null check (kind in ('home_project', 'personal_trip')),
  name text not null check (char_length(name) between 1 and 120),
  destination text,
  description text,
  start_date date,
  end_date date,
  budget numeric(12,2) check (budget is null or budget >= 0),
  currency text not null default 'USD',
  status text not null default 'active' check (status in ('active', 'completed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists personal_projects_user_kind_idx on public.personal_projects (user_id, kind, created_at desc);

create table if not exists public.personal_expenses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  project_id uuid not null references public.personal_projects(id) on delete cascade,
  merchant text,
  amount numeric(12,2) not null check (amount >= 0),
  currency text not null default 'USD',
  exchange_rate numeric(18,8) not null default 1,
  amount_usd numeric(12,2) not null default 0,
  category text not null default 'Other',
  expense_date date not null default current_date,
  notes text,
  receipt_path text,
  ocr_raw jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists personal_expenses_project_idx on public.personal_expenses (project_id, expense_date desc);
create index if not exists personal_expenses_user_idx on public.personal_expenses (user_id);

-- Groceries: one row per shopping trip, one row per item bought
create table if not exists public.grocery_receipts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  store text not null check (char_length(store) between 1 and 120),
  purchase_date date not null default current_date,
  total numeric(12,2) not null check (total >= 0),
  currency text not null default 'USD',
  receipt_path text,
  notes text,
  ocr_raw jsonb,
  created_at timestamptz not null default now()
);
create index if not exists grocery_receipts_user_date_idx on public.grocery_receipts (user_id, purchase_date desc);

create table if not exists public.grocery_items (
  id uuid primary key default gen_random_uuid(),
  receipt_id uuid not null references public.grocery_receipts(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 160),
  normalized_name text not null,
  category text not null default 'Other',
  quantity numeric(10,3) not null default 1 check (quantity > 0),
  unit_price numeric(12,2) not null check (unit_price >= 0),
  line_total numeric(12,2) not null check (line_total >= 0),
  created_at timestamptz not null default now()
);
create index if not exists grocery_items_user_name_idx on public.grocery_items (user_id, normalized_name);
create index if not exists grocery_items_receipt_idx on public.grocery_items (receipt_id);

-- Keep updated_at fresh
create or replace function public.personal_touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists personal_projects_touch on public.personal_projects;
create trigger personal_projects_touch before update on public.personal_projects
  for each row execute function public.personal_touch_updated_at();

drop trigger if exists personal_expenses_touch on public.personal_expenses;
create trigger personal_expenses_touch before update on public.personal_expenses
  for each row execute function public.personal_touch_updated_at();

-- Row level security: owner only, for every operation
alter table public.personal_projects enable row level security;
alter table public.personal_expenses enable row level security;
alter table public.grocery_receipts enable row level security;
alter table public.grocery_items enable row level security;

drop policy if exists "Own personal projects" on public.personal_projects;
create policy "Own personal projects" on public.personal_projects
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- An expense must belong to the caller AND sit inside one of the caller's projects
drop policy if exists "Own personal expenses" on public.personal_expenses;
create policy "Own personal expenses" on public.personal_expenses
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (
    user_id = (select auth.uid())
    and exists (
      select 1 from public.personal_projects p
      where p.id = project_id and p.user_id = (select auth.uid())
    )
  );

drop policy if exists "Own grocery receipts" on public.grocery_receipts;
create policy "Own grocery receipts" on public.grocery_receipts
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

drop policy if exists "Own grocery items" on public.grocery_items;
create policy "Own grocery items" on public.grocery_items
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (
    user_id = (select auth.uid())
    and exists (
      select 1 from public.grocery_receipts r
      where r.id = receipt_id and r.user_id = (select auth.uid())
    )
  );

notify pgrst, 'reload schema';

-- Weighed items (added later): store the weight unit with the item
alter table public.grocery_items add column if not exists unit text check (unit is null or char_length(unit) <= 8);
notify pgrst, 'reload schema';
