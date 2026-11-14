-- Account requests: people on the sign-in screen ask for an account (name + email and/or phone). Only the server can read or write them.
create table if not exists public.account_requests (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 2 and 80),
  email text check (email is null or char_length(email) <= 160),
  phone text check (phone is null or char_length(phone) <= 30),
  status text not null default 'new' check (status in ('new', 'done', 'dismissed')),
  ip text,
  created_at timestamptz not null default now(),
  handled_at timestamptz,
  check (email is not null or phone is not null)
);
alter table public.account_requests enable row level security;
-- No policies and no grants on purpose: the website's server (service role) is the only one that reads or writes this table.
revoke all on public.account_requests from anon, authenticated;
create index if not exists account_requests_status_idx on public.account_requests (status, created_at desc);
