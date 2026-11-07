-- Profile protection, part 2. Run in the Supabase SQL Editor (safe to run more than once).
--
-- migration_security_hardening.sql already stops a signed-in person from changing their own role.
-- The "update own profile" policy still lets them write any other column straight to the database, so this
-- extends the same trigger:
--   * telegram_id can only be CLEARED from the app (unlink). Linking happens in the Telegram bot, with the
--     service role. Otherwise someone who knows another person's Telegram number could claim it first, and that
--     person's receipts sent to the bot would land in the wrong account.
--   * temp_password_issued_at / temp_password_expires_at can only be cleared (done when a new password is set),
--     never moved or extended.
-- The service role and the SQL editor are not affected.

create or replace function public.protect_profile_privileges()
returns trigger
language plpgsql
as $$
begin
  if current_user in ('authenticated', 'anon') then
    if tg_op = 'INSERT' then
      new.role := 'user';
      new.telegram_id := null;
      new.temp_password_issued_at := null;
      new.temp_password_expires_at := null;
    else
      if new.role is distinct from old.role then
        raise exception 'Changing a role is not allowed' using errcode = '42501';
      end if;
      if new.telegram_id is distinct from old.telegram_id and new.telegram_id is not null then
        raise exception 'Linking Telegram is done in the Telegram bot' using errcode = '42501';
      end if;
      if new.temp_password_issued_at is distinct from old.temp_password_issued_at and new.temp_password_issued_at is not null then
        raise exception 'Changing a temporary password window is not allowed' using errcode = '42501';
      end if;
      if new.temp_password_expires_at is distinct from old.temp_password_expires_at and new.temp_password_expires_at is not null then
        raise exception 'Changing a temporary password window is not allowed' using errcode = '42501';
      end if;
    end if;
  end if;
  return new;
end;
$$;

notify pgrst, 'reload schema';
