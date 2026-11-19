-- Accounting export (Pro): the accounts each person maps their expense categories to, and which expenses were already exported.
create table if not exists public.accounting_settings (
  user_id uuid primary key references auth.users(id) on delete cascade,
  program text,
  credit_code text not null default '',
  credit_name text not null default '',
  accounts jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);
alter table public.accounting_settings enable row level security;
drop policy if exists "accounting_settings own" on public.accounting_settings;
create policy "accounting_settings own" on public.accounting_settings for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create table if not exists public.accounting_exports (
  user_id uuid not null references auth.users(id) on delete cascade,
  source text not null check (source in ('expense', 'receipt')),
  ref uuid not null,
  program text,
  exported_at timestamptz not null default now(),
  primary key (user_id, source, ref)
);
alter table public.accounting_exports enable row level security;
drop policy if exists "accounting_exports own" on public.accounting_exports;
create policy "accounting_exports own" on public.accounting_exports for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
