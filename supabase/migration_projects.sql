-- Business projects: a client, an optional budget, and the receipts spent on them, with a report for each.
-- Run once in the Supabase SQL Editor, after migration_limit_starts.sql. Safe to run again.
-- Receipt photos go in the existing private "receipts" bucket, under <user id>/projects/<project id>/...
-- Free: 2 active projects; Pro: the number set on the admin Limits page. Finished projects do not count.

create table if not exists public.business_projects (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 120),
  client_name text check (client_name is null or char_length(client_name) <= 120),
  contact_name text check (contact_name is null or char_length(contact_name) <= 120),
  contact_email text check (contact_email is null or char_length(contact_email) <= 160),
  contact_phone text check (contact_phone is null or char_length(contact_phone) <= 160),
  reference text check (reference is null or char_length(reference) <= 80),
  budget numeric(12, 2) check (budget is null or budget >= 0),
  currency text not null default 'USD',
  start_date date,
  end_date date,
  status text not null default 'active' check (status in ('active', 'done')),
  notes text check (notes is null or char_length(notes) <= 1000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists business_projects_user_idx on public.business_projects (user_id, status, created_at desc);

create table if not exists public.business_project_receipts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  project_id uuid not null references public.business_projects(id) on delete cascade,
  merchant text check (merchant is null or char_length(merchant) <= 160),
  amount numeric(12, 2) not null check (amount >= 0),
  currency text not null default 'USD',
  exchange_rate numeric(14, 6),
  amount_usd numeric(12, 2),
  category text,
  expense_date date not null,
  notes text check (notes is null or char_length(notes) <= 1000),
  receipt_path text,
  created_at timestamptz not null default now()
);
create index if not exists business_project_receipts_project_idx on public.business_project_receipts (project_id, expense_date desc);
create index if not exists business_project_receipts_user_idx on public.business_project_receipts (user_id);

alter table public.business_projects enable row level security;
alter table public.business_project_receipts enable row level security;

drop policy if exists "Own business projects" on public.business_projects;
create policy "Own business projects" on public.business_projects
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

drop policy if exists "Own business project receipts" on public.business_project_receipts;
create policy "Own business project receipts" on public.business_project_receipts
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (
    user_id = (select auth.uid())
    and exists (select 1 from public.business_projects p where p.id = project_id and p.user_id = (select auth.uid()))
  );

-- The Pro limit: a start day plus the Free and Pro numbers. The limit starts today the first time this runs.
do $$
begin
  if not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'pro_limits' and column_name = 'starts_projects') then
    alter table public.pro_limits add column starts_projects date;
    update public.pro_limits set starts_projects = current_date where id = 1;
  end if;
end $$;
alter table public.pro_limits add column if not exists free_projects int not null default 2 check (free_projects between 0 and 1000);
alter table public.pro_limits add column if not exists pro_projects int not null default 50 check (pro_projects between 1 and 10000);

notify pgrst, 'reload schema';
