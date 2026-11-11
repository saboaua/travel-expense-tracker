-- Migration 45: Flights on a trip (outbound, return, connection), with live status from a flight-data service.
-- Run in the Supabase SQL Editor (safe to run more than once). Needs the trips table (schema.sql).
-- Times are kept as the local wall-clock time at each airport (what a boarding pass shows), plus the airport's UTC offset
-- so the flight length can be worked out. A flight you enter by hand has no offset and is marked source = 'manual'.
-- Flights are private to their owner. A partner you shared the trip with sees the flight details (not confirmation code, seat or cabin) through migration 46.

create table if not exists public.trip_flights (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references public.trips(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  leg text not null default 'outbound' check (leg in ('outbound', 'return', 'connection')),
  flight_number text not null,
  airline text,
  aircraft text,
  flight_date date not null,
  dep_iata text,
  dep_city text,
  dep_name text,
  dep_local timestamp,
  dep_est_local timestamp,
  dep_offset integer,
  dep_terminal text,
  dep_gate text,
  arr_iata text,
  arr_city text,
  arr_name text,
  arr_local timestamp,
  arr_est_local timestamp,
  arr_offset integer,
  arr_terminal text,
  arr_gate text,
  status text not null default 'scheduled'
    check (status in ('scheduled', 'delayed', 'boarding', 'departed', 'landed', 'cancelled', 'diverted', 'unknown')),
  pnr text,
  seat text,
  cabin text,
  source text not null default 'manual' check (source in ('auto', 'manual')),
  alerts boolean not null default true,
  last_synced_at timestamptz,
  last_alert_key text,
  created_at timestamptz not null default now()
);

create index if not exists trip_flights_trip_idx on public.trip_flights (trip_id);
create index if not exists trip_flights_user_date_idx on public.trip_flights (user_id, flight_date);

alter table public.trip_flights enable row level security;

drop policy if exists "Own trip flights" on public.trip_flights;
create policy "Own trip flights" on public.trip_flights
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (
    user_id = (select auth.uid())
    and exists (select 1 from public.trips t where t.id = trip_id and t.user_id = (select auth.uid()))
  );
