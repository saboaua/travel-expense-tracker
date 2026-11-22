-- Migration: what the online price matching misses.
-- Run in the Supabase SQL Editor (safe to run more than once). Needs migration_help_latest.sql first (help_is_admin).
-- When a Best Prices search, or an item on a shopping list, finds nothing in any online shop list, the wording is counted here
-- (no user is stored), so the admin can see which names the matching should learn. Only admins can read it.

create table if not exists public.online_search_misses (
  q_norm text primary key check (char_length(q_norm) <= 120),
  sample text not null check (char_length(sample) <= 120),
  kind text not null check (kind in ('search', 'list')),
  hits integer not null default 1,
  first_at timestamptz not null default now(),
  last_at timestamptz not null default now()
);
alter table public.online_search_misses enable row level security;
drop policy if exists "Admins read search misses" on public.online_search_misses;
create policy "Admins read search misses" on public.online_search_misses for select to authenticated using (public.help_is_admin());
drop policy if exists "Admins clear search misses" on public.online_search_misses;
create policy "Admins clear search misses" on public.online_search_misses for delete to authenticated using (public.help_is_admin());

create or replace function public.log_search_miss(p_q text, p_kind text) returns void
language plpgsql security definer set search_path = public as $$
declare n text := left(regexp_replace(lower(coalesce(p_q, '')), '[^a-z0-9]+', ' ', 'g'), 120);
begin
  if auth.uid() is null or char_length(trim(n)) < 2 or p_kind not in ('search', 'list') then return; end if;
  insert into public.online_search_misses (q_norm, sample, kind) values (trim(n), left(trim(p_q), 120), p_kind)
  on conflict (q_norm) do update set hits = online_search_misses.hits + 1, last_at = now();
end $$;
revoke all on function public.log_search_miss(text, text) from public, anon;
grant execute on function public.log_search_miss(text, text) to authenticated;

notify pgrst, 'reload schema';
