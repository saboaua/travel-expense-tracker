-- Migration 46: a partner sees the flights of a trip you shared with them (details only).
-- Run in the Supabase SQL Editor (safe to run more than once). Needs migration_sharing.sql (sharing) and
-- migration_trip_flights.sql (45).
--
-- What a partner gets: airline, flight number, route, times, terminal, gate and status.
-- What stays private to you, and is never read here: confirmation code, seat, cabin, alert setting, owner id.
-- Same rules as shared trips: only for a trip you shared with an approved partner, only while the share is live, and the
-- function checks its own result (the failsafe switches sharing off for everyone if a row could not be justified).
-- Columns are written out on purpose: a column added to trip_flights later is NOT shared until it is added here.

create or replace function public.shared_trip_flights()
returns table (share_id uuid, trip_id uuid, flight_id uuid, leg text, flight_number text, airline text, aircraft text, flight_date date,
               dep_iata text, dep_city text, dep_name text, dep_local timestamp, dep_est_local timestamp, dep_offset integer, dep_terminal text, dep_gate text,
               arr_iata text, arr_city text, arr_name text, arr_local timestamp, arr_est_local timestamp, arr_offset integer, arr_terminal text, arr_gate text,
               status text, source text, shared_by text)
language plpgsql volatile security definer set search_path = public as $$
declare
  uid uuid := public.sharing_gate();
  found_rows jsonb;
  bad integer;
begin
  select coalesce(jsonb_agg(to_jsonb(r)), '[]'::jsonb) into found_rows from (
    select s.id as share_id, f.trip_id, f.id as flight_id, f.leg, f.flight_number, f.airline, f.aircraft, f.flight_date,
           f.dep_iata, f.dep_city, f.dep_name, f.dep_local, f.dep_est_local, f.dep_offset, f.dep_terminal, f.dep_gate,
           f.arr_iata, f.arr_city, f.arr_name, f.arr_local, f.arr_est_local, f.arr_offset, f.arr_terminal, f.arr_gate,
           f.status, f.source, public.sharing_name(s.owner_id) as shared_by
    from public.shares s
    join public.partnerships p on p.id = s.partnership_id
    join public.trips t on t.id = s.item_id and t.user_id = s.owner_id
    join public.trip_flights f on f.trip_id = t.id and f.user_id = s.owner_id
    where s.kind = 'trip' and p.status = 'active'
      and ((p.requester_id = uid and s.owner_id = p.invitee_id) or (p.invitee_id = uid and s.owner_id = p.requester_id))
    order by f.flight_date, f.dep_local nulls last
  ) r;

  select count(*) into bad from jsonb_to_recordset(found_rows) as x(share_id uuid, trip_id uuid)
  where not exists (
    select 1 from public.shares s2
    join public.partnerships p2 on p2.id = s2.partnership_id
    where s2.id = x.share_id and s2.kind = 'trip' and s2.item_id = x.trip_id and p2.status = 'active'
      and s2.owner_id <> uid and uid in (p2.requester_id, p2.invitee_id) and s2.owner_id in (p2.requester_id, p2.invitee_id)
  );
  if bad > 0 then
    perform public.sharing_trip_failsafe('shared_trip_flights', jsonb_build_object('rows', bad));
    return;
  end if;

  return query select x.share_id, x.trip_id, x.flight_id, x.leg, x.flight_number, x.airline, x.aircraft, x.flight_date,
         x.dep_iata, x.dep_city, x.dep_name, x.dep_local, x.dep_est_local, x.dep_offset, x.dep_terminal, x.dep_gate,
         x.arr_iata, x.arr_city, x.arr_name, x.arr_local, x.arr_est_local, x.arr_offset, x.arr_terminal, x.arr_gate,
         x.status, x.source, x.shared_by
  from jsonb_to_recordset(found_rows) as x(share_id uuid, trip_id uuid, flight_id uuid, leg text, flight_number text, airline text, aircraft text, flight_date date,
       dep_iata text, dep_city text, dep_name text, dep_local timestamp, dep_est_local timestamp, dep_offset integer, dep_terminal text, dep_gate text,
       arr_iata text, arr_city text, arr_name text, arr_local timestamp, arr_est_local timestamp, arr_offset integer, arr_terminal text, arr_gate text,
       status text, source text, shared_by text);
end;
$$;

revoke all on function public.shared_trip_flights() from public, anon;
grant execute on function public.shared_trip_flights() to authenticated;
