-- Login logo size, privacy policy text, and support contact form.
-- Run in the Supabase SQL Editor.

alter table public.app_settings
  add column if not exists login_logo_size int default 56,
  add column if not exists privacy_policy text,
  add column if not exists support_email text;

create table if not exists public.support_requests (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  email text not null,
  subject text,
  message text not null,
  status text not null default 'new' check (status in ('new', 'resolved')),
  ip text,
  created_at timestamptz not null default now()
);

create index if not exists support_requests_created_idx on public.support_requests (created_at desc);

alter table public.support_requests enable row level security;

-- Submissions are inserted by the server (service role). Only admins can read and manage them.
drop policy if exists "Admins read support requests" on public.support_requests;
create policy "Admins read support requests"
  on public.support_requests for select
  to authenticated
  using (exists (select 1 from public.profiles where id = auth.uid() and role = 'admin'));

drop policy if exists "Admins update support requests" on public.support_requests;
create policy "Admins update support requests"
  on public.support_requests for update
  to authenticated
  using (exists (select 1 from public.profiles where id = auth.uid() and role = 'admin'))
  with check (exists (select 1 from public.profiles where id = auth.uid() and role = 'admin'));

drop policy if exists "Admins delete support requests" on public.support_requests;
create policy "Admins delete support requests"
  on public.support_requests for delete
  to authenticated
  using (exists (select 1 from public.profiles where id = auth.uid() and role = 'admin'));

notify pgrst, 'reload schema';
