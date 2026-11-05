-- Home place: where the person lives. Scan and Upload use it to know when a receipt is probably personal
-- (for example groceries at home) rather than for a business trip. Run once in the Supabase SQL Editor.
alter table public.profiles add column if not exists home_country text;
alter table public.profiles add column if not exists home_city text;
