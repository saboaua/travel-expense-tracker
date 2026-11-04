-- Document number (passport no., visa no., policy no., ...) on travel documents.
-- Run in the Supabase SQL Editor after migration_documents.sql.
alter table public.travel_documents
  add column if not exists document_number text
  check (document_number is null or char_length(document_number) <= 40);

notify pgrst, 'reload schema';
