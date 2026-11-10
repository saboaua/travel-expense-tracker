-- Migration 40: Choose where each document shows: on the Personal dashboard, the Business dashboard, or both.
-- Run in the Supabase SQL Editor (safe to run more than once). Needs migration_documents.sql first.
-- Every document you already have stays on both dashboards, exactly as before.

alter table public.travel_documents
  add column if not exists show_on text not null default 'both'
  check (show_on in ('personal', 'business', 'both'));
