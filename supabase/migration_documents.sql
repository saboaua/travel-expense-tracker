-- Travel documents: passport (with renewal reminders) and documents kept per trip.
-- Run in the Supabase SQL Editor.

create table if not exists public.travel_documents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  trip_id uuid references public.trips(id) on delete cascade,   -- null = general (passport, ID, ...)
  kind text not null default 'other'
    check (kind in ('passport','visa','id','ticket','booking','insurance','vaccination','other')),
  title text not null check (char_length(title) between 1 and 120),
  issuing_country text check (issuing_country is null or char_length(issuing_country) <= 80),
  expiry_date date,
  notes text check (notes is null or char_length(notes) <= 1000),
  file_path text,
  created_at timestamptz not null default now()
);

create index if not exists travel_documents_user_idx on public.travel_documents (user_id, kind);
create index if not exists travel_documents_trip_idx on public.travel_documents (trip_id);

alter table public.travel_documents enable row level security;

drop policy if exists "Own travel documents" on public.travel_documents;
create policy "Own travel documents" on public.travel_documents
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (
    user_id = (select auth.uid())
    and (trip_id is null or exists (
      select 1 from public.trips t where t.id = trip_id and t.user_id = (select auth.uid())
    ))
  );

-- Private bucket for the files. Objects live under <user id>/...
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('documents', 'documents', false, 10485760,
        array['application/pdf','image/jpeg','image/png','image/webp','image/heic','image/heif'])
on conflict (id) do nothing;

drop policy if exists "Own documents read" on storage.objects;
create policy "Own documents read" on storage.objects for select to authenticated
  using (bucket_id = 'documents' and (storage.foldername(name))[1] = (select auth.uid())::text);

drop policy if exists "Own documents insert" on storage.objects;
create policy "Own documents insert" on storage.objects for insert to authenticated
  with check (bucket_id = 'documents' and (storage.foldername(name))[1] = (select auth.uid())::text);

drop policy if exists "Own documents delete" on storage.objects;
create policy "Own documents delete" on storage.objects for delete to authenticated
  using (bucket_id = 'documents' and (storage.foldername(name))[1] = (select auth.uid())::text);

notify pgrst, 'reload schema';
