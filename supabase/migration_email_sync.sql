-- Keeps profiles.email in step with the sign-in email when a person changes it (Profile > Sign-in email).
-- Run once in the Supabase SQL Editor (safe to run more than once).

create or replace function public.sync_profile_email()
returns trigger as $$
begin
  if new.email is distinct from old.email then
    update public.profiles set email = new.email, updated_at = now() where id = new.id;
  end if;
  return new;
end;
$$ language plpgsql security definer set search_path = public;

drop trigger if exists on_auth_user_email_changed on auth.users;
create trigger on_auth_user_email_changed
  after update of email on auth.users
  for each row execute function public.sync_profile_email();

notify pgrst, 'reload schema';
