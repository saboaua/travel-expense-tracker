-- Migration: the AI's verdicts on doubtful online price matches ("is this shop product the same as the one on your receipt?").
-- Run in the Supabase SQL Editor (safe to run more than once). Only product names are kept, no user. Everyone signed in can read it;
-- only the server (service role) writes it. Needs GEMINI_API_KEY on Vercel (already used for receipts); without it nothing is judged.

create table if not exists public.product_match_cache (
  pair_key text primary key check (char_length(pair_key) <= 600),
  same boolean not null,
  created_at timestamptz not null default now()
);
alter table public.product_match_cache enable row level security;
drop policy if exists "Read match cache" on public.product_match_cache;
create policy "Read match cache" on public.product_match_cache for select to authenticated using (true);

notify pgrst, 'reload schema';
