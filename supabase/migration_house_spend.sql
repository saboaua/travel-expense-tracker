-- Migration 55: House and repairs. A quick spend can belong to one of your home projects and carry a photo of the invoice.
-- Run in the Supabase SQL Editor (safe to run more than once). Needs migration_quick_spend.sql first.

alter table public.personal_spends add column if not exists project_id uuid references public.personal_projects(id) on delete set null;
alter table public.personal_spends add column if not exists receipt_path text check (receipt_path is null or char_length(receipt_path) <= 300);
create index if not exists personal_spends_project_idx on public.personal_spends (project_id) where project_id is not null;

-- A spend may only point at one of the caller's own projects
drop policy if exists "Own personal spends" on public.personal_spends;
create policy "Own personal spends" on public.personal_spends
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (
    user_id = (select auth.uid())
    and (
      project_id is null
      or exists (select 1 from public.personal_projects p where p.id = project_id and p.user_id = (select auth.uid()))
    )
  );
