-- Company logos for subscriptions. Run once in the Supabase SQL Editor. Safe to run again.
-- 1) A logo library the admin keeps: a company name, extra words it also matches, and a small logo picture.
-- 2) Subscriptions can show a logo (from the library, found from a website, or uploaded by the person) and remember a website.
-- Logos are stored as small picture data inside the row, so they load with the list and work offline.

create table if not exists public.logo_library (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 60),
  keywords text[] not null default '{}',
  logo text not null check (logo like 'data:image/%' and char_length(logo) <= 80000),
  created_at timestamptz not null default now()
);
create unique index if not exists logo_library_name_idx on public.logo_library (lower(name));

alter table public.logo_library enable row level security;
drop policy if exists "Logo library read" on public.logo_library;
create policy "Logo library read" on public.logo_library for select to authenticated using (true);
drop policy if exists "Logo library admin insert" on public.logo_library;
create policy "Logo library admin insert" on public.logo_library for insert to authenticated
  with check (exists (select 1 from public.profiles where id = auth.uid() and role = 'admin'));
drop policy if exists "Logo library admin update" on public.logo_library;
create policy "Logo library admin update" on public.logo_library for update to authenticated
  using (exists (select 1 from public.profiles where id = auth.uid() and role = 'admin'))
  with check (exists (select 1 from public.profiles where id = auth.uid() and role = 'admin'));
drop policy if exists "Logo library admin delete" on public.logo_library;
create policy "Logo library admin delete" on public.logo_library for delete to authenticated
  using (exists (select 1 from public.profiles where id = auth.uid() and role = 'admin'));

alter table public.subscriptions add column if not exists logo text check (logo is null or (logo like 'data:image/%' and char_length(logo) <= 80000));
alter table public.subscriptions add column if not exists website text check (website is null or char_length(website) <= 200);

notify pgrst, 'reload schema';
