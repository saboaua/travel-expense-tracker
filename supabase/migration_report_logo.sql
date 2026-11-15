-- Your business logo for Excel and PDF reports. The picture itself is stored privately in the receipts bucket under your own folder;
-- this column only remembers where. Run in the Supabase SQL Editor (safe to run more than once).
alter table public.profiles add column if not exists business_logo_path text;
