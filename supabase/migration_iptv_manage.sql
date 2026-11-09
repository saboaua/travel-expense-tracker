-- Migration 38: the IPTV clients page can be given to a role ("IPTV clients" in Admin > Roles), not only the admin.
-- Run after 36 and 37. Safe to run twice.
-- Who may manage IPTV clients: the admin, or any role that was given the "iptv.manage" option.
-- Every IPTV table and action already asks this one function, so changing it is the whole change.
create or replace function public.iptv_is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.profiles pr
    left join public.roles r on r.key = pr.role
    where pr.id = auth.uid() and (pr.role = 'admin' or 'iptv.manage' = any (coalesce(r.permissions, '{}'::text[])))
  )
$$;
revoke all on function public.iptv_is_admin() from public;
grant execute on function public.iptv_is_admin() to authenticated;
notify pgrst, 'reload schema';
