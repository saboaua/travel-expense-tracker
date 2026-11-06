-- Driver's license as a document type (with expiry date and number, like a passport or ID card).
-- Run in the Supabase SQL Editor. Safe to run more than once.
alter table public.travel_documents drop constraint if exists travel_documents_kind_check;
alter table public.travel_documents
  add constraint travel_documents_kind_check
  check (kind in ('passport','visa','id','license','ticket','booking','insurance','vaccination','other'));

notify pgrst, 'reload schema';
