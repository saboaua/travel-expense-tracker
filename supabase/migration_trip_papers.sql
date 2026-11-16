-- Trip papers: transfers, tickets and booking details kept with one trip. Run once in the Supabase SQL Editor. Safe to run again.
-- Not documents: no type, no expiry, no reminders. Only the person who added them can see them.
-- A daily job removes them (and their files) 7 days after the trip ends.
-- Files go in the existing private "documents" bucket, under <user id>/papers/<trip id>/..., so it needs migration_documents.sql first.

create table if not exists public.trip_papers (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  trip_id uuid not null references public.trips(id) on delete cascade,
  title text not null check (char_length(title) between 1 and 120),
  note text check (note is null or char_length(note) <= 1000),
  file_path text,
  created_at timestamptz not null default now()
);

create index if not exists trip_papers_trip_idx on public.trip_papers (trip_id, created_at desc);
create index if not exists trip_papers_user_idx on public.trip_papers (user_id);

alter table public.trip_papers enable row level security;

drop policy if exists "Own trip papers" on public.trip_papers;
create policy "Own trip papers" on public.trip_papers
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (
    user_id = (select auth.uid())
    and exists (select 1 from public.trips t where t.id = trip_id and t.user_id = (select auth.uid()))
  );

notify pgrst, 'reload schema';
