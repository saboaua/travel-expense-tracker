-- AI summary on support requests. Run once in the Supabase SQL Editor. Safe to run again.
alter table public.support_requests add column if not exists ai_status text check (ai_status is null or ai_status in ('done','failed'));
alter table public.support_requests add column if not exists ai_summary text;
alter table public.support_requests add column if not exists ai_category text check (ai_category is null or ai_category in ('bug','question','account','billing','idea','unclear'));
alter table public.support_requests add column if not exists ai_priority text check (ai_priority is null or ai_priority in ('low','normal','high'));
alter table public.support_requests add column if not exists ai_steps jsonb not null default '[]'::jsonb;
notify pgrst, 'reload schema';
