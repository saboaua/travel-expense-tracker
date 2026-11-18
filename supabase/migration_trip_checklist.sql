-- Trip checklist: a to-do and packing list on each trip. Run once in the Supabase SQL Editor. Safe to run again.
-- Only the person who made it can see it, even on a trip they shared. It is kept after the trip so a later trip to the same place can copy it.

create table if not exists public.trip_checklist_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  trip_id uuid not null references public.trips(id) on delete cascade,
  title text not null check (char_length(title) between 1 and 120),
  category text not null default 'other' check (category in ('documents', 'clothes', 'tech', 'health', 'other')),
  done boolean not null default false,
  sort integer not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists trip_checklist_trip_idx on public.trip_checklist_items (trip_id, sort);
create index if not exists trip_checklist_user_idx on public.trip_checklist_items (user_id);

alter table public.trip_checklist_items enable row level security;

drop policy if exists "Own trip checklist" on public.trip_checklist_items;
create policy "Own trip checklist" on public.trip_checklist_items
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (
    user_id = (select auth.uid())
    and exists (select 1 from public.trips t where t.id = trip_id and t.user_id = (select auth.uid()))
  );

notify pgrst, 'reload schema';
