-- Free Pro month for new accounts. Run once in the Supabase SQL Editor, after migration_project_types_plans.sql. Safe to run again.
-- The admin sets it under Admin, Free Pro month: Off, Always, or Only between two dates (for a promotion), and how many days.
-- Only accounts created while it is on get it. People who already have an account are not touched, and nobody gets it twice.

create table if not exists public.pro_trial_settings (
  id int primary key default 1 check (id = 1),
  mode text not null default 'always' check (mode in ('off','always','dates')),
  days int not null default 30 check (days between 1 and 365),
  from_date date,
  to_date date,
  updated_at timestamptz not null default now()
);
alter table public.pro_trial_settings enable row level security;
drop policy if exists "Anyone signed in can read the free month" on public.pro_trial_settings;
create policy "Anyone signed in can read the free month" on public.pro_trial_settings for select to authenticated using (true);
insert into public.pro_trial_settings (id) values (1) on conflict (id) do nothing;

-- A plan can now be a free month
alter table public.user_plans drop constraint if exists user_plans_period_check;
alter table public.user_plans add constraint user_plans_period_check check (period in ('monthly','yearly','gift','trial'));

-- When an account is created, give it Pro for the chosen days if the free month is open today
create or replace function public.grant_pro_trial()
returns trigger as $$
declare
  s public.pro_trial_settings%rowtype;
  open_today boolean;
begin
  select * into s from public.pro_trial_settings where id = 1;
  if not found then return new; end if;
  open_today := s.mode = 'always'
    or (s.mode = 'dates' and (s.from_date is null or current_date >= s.from_date) and (s.to_date is null or current_date <= s.to_date));
  if open_today then
    insert into public.user_plans (user_id, plan, period, ends_on)
    values (new.id, 'pro', 'trial', current_date + s.days)
    on conflict (user_id) do nothing;
  end if;
  return new;
exception when others then
  return new; -- never stop an account from being created
end;
$$ language plpgsql security definer set search_path = public;

drop trigger if exists on_profile_created_pro_trial on public.profiles;
create trigger on_profile_created_pro_trial
  after insert on public.profiles
  for each row execute function public.grant_pro_trial();

notify pgrst, 'reload schema';
