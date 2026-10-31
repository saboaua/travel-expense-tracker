-- Travel Expense Tracker - Database Schema
-- Run this in your Supabase SQL Editor

-- Profiles (extends auth.users)
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  email text,
  company_name text,
  logo_url text,
  theme jsonb default '{}'::jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Trips
create table if not exists public.trips (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  name text not null,
  start_date date not null,
  end_date date,
  currency text not null default 'USD',
  status text not null default 'active' check (status in ('active', 'completed')),
  notes text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Expenses / Receipts
create table if not exists public.expenses (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references public.trips(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  merchant text,
  amount numeric(12, 2) not null,
  currency text,
  category text,
  expense_date date not null,
  notes text,
  receipt_path text,
  ocr_raw jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Indexes
create index if not exists idx_trips_user_id on public.trips(user_id);
create index if not exists idx_trips_start_date on public.trips(start_date);
create index if not exists idx_expenses_trip_id on public.expenses(trip_id);
create index if not exists idx_expenses_user_id on public.expenses(user_id);
create index if not exists idx_expenses_expense_date on public.expenses(expense_date);

-- Enable RLS
alter table public.profiles enable row level security;
alter table public.trips enable row level security;
alter table public.expenses enable row level security;

-- Profiles policies
create policy "Users can view own profile"
  on public.profiles for select
  using (auth.uid() = id);

create policy "Users can update own profile"
  on public.profiles for update
  using (auth.uid() = id);

create policy "Users can insert own profile"
  on public.profiles for insert
  with check (auth.uid() = id);

-- Trips policies
create policy "Users can view own trips"
  on public.trips for select
  using (auth.uid() = user_id);

create policy "Users can create own trips"
  on public.trips for insert
  with check (auth.uid() = user_id);

create policy "Users can update own trips"
  on public.trips for update
  using (auth.uid() = user_id);

create policy "Users can delete own trips"
  on public.trips for delete
  using (auth.uid() = user_id);

-- Expenses policies
create policy "Users can view own expenses"
  on public.expenses for select
  using (auth.uid() = user_id);

create policy "Users can create own expenses"
  on public.expenses for insert
  with check (auth.uid() = user_id);

create policy "Users can update own expenses"
  on public.expenses for update
  using (auth.uid() = user_id);

create policy "Users can delete own expenses"
  on public.expenses for delete
  using (auth.uid() = user_id);

-- Auto-create profile on signup
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, full_name, email)
  values (
    new.id,
    new.raw_user_meta_data->>'full_name',
    new.email
  );
  return new;
end;
$$ language plpgsql security definer;

-- Trigger
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Storage bucket for receipts (run in Supabase dashboard or via API)
-- insert into storage.buckets (id, name, public) values ('receipts', 'receipts', false);

-- Storage policies (after creating the bucket)
-- create policy "Users can upload own receipts"
--   on storage.objects for insert
--   with check (bucket_id = 'receipts' and auth.uid()::text = (storage.foldername(name))[1]);

-- create policy "Users can view own receipts"
--   on storage.objects for select
--   using (bucket_id = 'receipts' and auth.uid()::text = (storage.foldername(name))[1]);

-- create policy "Users can delete own receipts"
--   on storage.objects for delete
--   using (bucket_id = 'receipts' and auth.uid()::text = (storage.foldername(name))[1]);