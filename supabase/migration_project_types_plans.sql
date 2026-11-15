-- Projects get a type (Home, Car, Boat or one you name yourself), and paid plans (Pro) switched on by an admin.
-- Run in the Supabase SQL Editor (safe to run more than once). Needs migration_personal.sql first.

-- 1. Project types. Projects made before this are Home.
alter table public.personal_projects add column if not exists project_type text not null default 'home'
  check (project_type in ('home','car','motorbike','boat','garden','pets','tech','event','business','other','custom'));
alter table public.personal_projects add column if not exists type_label text check (type_label is null or char_length(type_label) between 1 and 24);
alter table public.personal_projects add column if not exists type_icon text check (type_icon is null or char_length(type_icon) <= 24);
alter table public.personal_projects add column if not exists type_color text check (type_color is null or type_color ~ '^#[0-9a-fA-F]{6}$');

-- 2. Plans: who has Pro, and until when. People can read their own row; only the admin page (service role) writes.
create table if not exists public.user_plans (
  user_id uuid primary key references auth.users(id) on delete cascade,
  plan text not null default 'pro' check (plan in ('pro')),
  period text not null check (period in ('monthly','yearly','gift')),
  ends_on date,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null
);
alter table public.user_plans enable row level security;
drop policy if exists "Read own plan" on public.user_plans;
create policy "Read own plan" on public.user_plans for select to authenticated using (user_id = auth.uid());

-- 3. Help topic wording: "Home projects" is now "Projects".
update public.help_topics set
  title = replace(replace(title, 'Home projects', 'Projects'), 'home projects', 'projects'),
  summary = replace(replace(summary, 'Home projects', 'Projects'), 'home projects', 'projects'),
  body = replace(replace(replace(body, 'Your home projects', 'Your projects'), 'Home projects', 'Projects'), 'home projects', 'projects')
where title ilike '%home project%' or summary ilike '%home project%' or body ilike '%home project%';
