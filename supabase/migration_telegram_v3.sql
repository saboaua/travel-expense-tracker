-- Telegram, part 3: admin actions typed in the chat (create a user, change a role) wait here for a
-- confirmation tap. Only the server (service role) reads and writes it. Run once in the Supabase SQL Editor.
create table if not exists public.telegram_admin_actions (
  id uuid primary key default gen_random_uuid(),
  admin_id uuid not null references public.profiles(id) on delete cascade,
  kind text not null check (kind in ('newuser', 'role')),
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '10 minutes'),
  done_at timestamptz
);
alter table public.telegram_admin_actions enable row level security;
create index if not exists telegram_admin_actions_admin_idx on public.telegram_admin_actions (admin_id, created_at desc);
