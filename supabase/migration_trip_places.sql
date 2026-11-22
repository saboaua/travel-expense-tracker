-- Migration: the top things to do and places to eat saved for each trip (Home > "Around your trip").
-- Run in the Supabase SQL Editor (safe to run more than once). One row per trip and person, readable and writable only by its owner.
-- The list comes from OpenStreetMap (open data, © OpenStreetMap contributors) and is saved so the map service is asked once per trip.
-- A row is deleted the day after the trip ends (the app clears the person's old rows when the card opens, and the daily job clears the rest).

create table if not exists public.trip_places (
  user_id uuid not null references public.profiles(id) on delete cascade,
  trip_id uuid not null,
  destination text not null check (char_length(destination) <= 120),
  trip_end date not null,
  things jsonb not null default '[]'::jsonb,
  eat jsonb not null default '[]'::jsonb,
  fetched_at timestamptz not null default now(),
  primary key (user_id, trip_id)
);
alter table public.trip_places enable row level security;

drop policy if exists "Own trip places read" on public.trip_places;
create policy "Own trip places read" on public.trip_places for select to authenticated using (auth.uid() = user_id);
drop policy if exists "Own trip places add" on public.trip_places;
create policy "Own trip places add" on public.trip_places for insert to authenticated with check (auth.uid() = user_id);
drop policy if exists "Own trip places change" on public.trip_places;
create policy "Own trip places change" on public.trip_places for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists "Own trip places delete" on public.trip_places;
create policy "Own trip places delete" on public.trip_places for delete to authenticated using (auth.uid() = user_id);

-- The daily job: removes every row whose trip ended before yesterday. Only the server (service role) may run it.
create or replace function public.purge_trip_places() returns integer
language plpgsql security definer set search_path = public as $$
declare n integer;
begin
  delete from public.trip_places where trip_end < current_date - 1;
  get diagnostics n = row_count;
  return n;
end $$;
revoke all on function public.purge_trip_places() from public, anon, authenticated;
grant execute on function public.purge_trip_places() to service_role;

notify pgrst, 'reload schema';
