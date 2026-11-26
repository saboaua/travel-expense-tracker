-- Where does the app think "Ling & Sons" is? Run in the Supabase SQL Editor (read only). Change 'ling' to check another store.
-- Check 1: the places the admin keeps (Admin > Supermarket places). One of these should be the right spot.
select 'admin place' as kind, name, lat, lng, coalesce(fixed, false) as fixed_by_hand
from public.supermarket_places
where name ilike '%ling%'
order by name;

-- Check 2: the copies each person's app saved for itself (from OpenStreetMap or a dropped pin). Smart cart can pick one of these instead.
select 'saved copy' as kind, name, lat, lng, source, created_at
from public.store_locations
where name ilike '%ling%'
order by created_at desc;
