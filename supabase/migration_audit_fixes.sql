-- Migration 64: audit fixes. Safe to run more than once.

-- 1. Savings pauses: a plan can be paused and resumed several times. Each period is {"from": "YYYY-MM-DD", "to": "YYYY-MM-DD" or null}.
alter table public.savings_plans add column if not exists pauses jsonb not null default '[]'::jsonb;
update public.savings_plans
   set pauses = jsonb_build_array(jsonb_build_object('from', paused_on, 'to', null))
 where paused_on is not null and pauses = '[]'::jsonb;

-- 2. Savings events must belong to one of your own plans, and a month can be skipped only once per plan.
drop policy if exists "Own savings events" on public.savings_events;
create policy "Own savings events" on public.savings_events
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (
    user_id = (select auth.uid())
    and exists (select 1 from public.savings_plans p where p.id = plan_id and p.user_id = (select auth.uid()))
  );
drop index if exists public.savings_events_skip_idx;
create unique index if not exists savings_events_skip_idx on public.savings_events (user_id, plan_id, month) where kind = 'skip';

-- 3. House areas follow the same permission as the other category pages.
drop policy if exists "Admins manage house areas" on public.house_areas;
drop policy if exists "Category managers manage house areas" on public.house_areas;
create policy "Category managers manage house areas"
  on public.house_areas for all
  to authenticated
  using (public.has_permission('categories.manage'))
  with check (public.has_permission('categories.manage'));

-- 4. Budget limits must be an object, e.g. {"groceries": 700}.
do $$ begin
  alter table public.personal_budgets add constraint personal_budgets_limits_object check (jsonb_typeof(limits) = 'object');
exception when duplicate_object then null; end $$;

notify pgrst, 'reload schema';
