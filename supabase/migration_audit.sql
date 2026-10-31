-- Audit trail & security monitoring
-- Run in Supabase SQL Editor

-- General audit log (business actions)
create table if not exists public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references public.profiles(id) on delete set null,
  actor_email text,
  action text not null,              -- e.g. user.created, trip.created, expense.deleted
  entity_type text,                  -- user, trip, expense, profile, auth
  entity_id text,
  details jsonb default '{}'::jsonb,
  ip_address text,
  user_agent text,
  origin text,
  created_at timestamptz not null default now()
);

create index if not exists idx_audit_logs_created_at on public.audit_logs(created_at desc);
create index if not exists idx_audit_logs_actor_id on public.audit_logs(actor_id);
create index if not exists idx_audit_logs_action on public.audit_logs(action);
create index if not exists idx_audit_logs_entity on public.audit_logs(entity_type, entity_id);

-- Security events (auth failures, brute force, suspicious activity)
create table if not exists public.security_events (
  id uuid primary key default gen_random_uuid(),
  event_type text not null,          -- login_failed, login_success, brute_force, suspicious, rate_limit
  severity text not null default 'info' check (severity in ('info', 'warning', 'critical')),
  email_attempted text,
  user_id uuid references public.profiles(id) on delete set null,
  ip_address text,
  user_agent text,
  origin text,
  country text,
  details jsonb default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_security_events_created_at on public.security_events(created_at desc);
create index if not exists idx_security_events_type on public.security_events(event_type);
create index if not exists idx_security_events_ip on public.security_events(ip_address);
create index if not exists idx_security_events_severity on public.security_events(severity);

-- RLS: only admins can read; inserts via service role / server
alter table public.audit_logs enable row level security;
alter table public.security_events enable row level security;

create policy "Admins can view audit logs"
  on public.audit_logs for select
  using (
    exists (
      select 1 from public.profiles
      where id = auth.uid() and role = 'admin'
    )
  );

create policy "Admins can view security events"
  on public.security_events for select
  using (
    exists (
      select 1 from public.profiles
      where id = auth.uid() and role = 'admin'
    )
  );

-- Allow service role / authenticated inserts (server-side only in practice)
create policy "Service can insert audit logs"
  on public.audit_logs for insert
  with check (true);

create policy "Service can insert security events"
  on public.security_events for insert
  with check (true);
