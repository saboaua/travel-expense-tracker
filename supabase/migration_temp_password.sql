-- Temporary password expiry for admin-created users.
-- Run in the Supabase SQL Editor.

alter table public.profiles
  add column if not exists temp_password_issued_at timestamptz,
  add column if not exists temp_password_expires_at timestamptz;

-- Users who were created before this migration and still have not set their own password:
-- give them the same 24h window, counted from when the account was created.
update public.profiles
set temp_password_issued_at = created_at,
    temp_password_expires_at = created_at + interval '24 hours'
where must_change_password = true
  and temp_password_expires_at is null;

notify pgrst, 'reload schema';
