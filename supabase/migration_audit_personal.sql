-- Audit trail for the Personal side and account changes.
-- Run in the Supabase SQL Editor. Safe to run again.
--
-- Records who did what and when: the table, the record, and (for a change) the NAMES of the columns that changed.
-- It never stores what was written (store names, notes, amounts), so the trail shows activity, not private content.

create or replace function public.write_audit_light()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  actor uuid := auth.uid();
  actor_email text;
  rec jsonb;
  old_rec jsonb;
  owner text;
  rid text;
  changed jsonb := '[]'::jsonb;
begin
  rec := to_jsonb(case when TG_OP = 'DELETE' then OLD else NEW end);
  owner := coalesce(rec->>'user_id', case when TG_TABLE_NAME = 'profiles' then rec->>'id' end);
  rid := coalesce(rec->>'id', rec->>'user_id');
  if actor is null then actor := nullif(owner, '')::uuid; end if;

  if TG_OP = 'UPDATE' then
    old_rec := to_jsonb(OLD);
    select coalesce(jsonb_agg(e.k order by e.k), '[]'::jsonb) into changed
    from jsonb_each(rec) as e(k, v)
    where old_rec -> e.k is distinct from e.v
      and e.k not in ('updated_at', 'badge_seen', 'badge_best', 'shared_total', 'traveler_seen', 'share_last_at', 'share_last_count', 'share_last_error');
    -- bookkeeping only: nothing a person did
    if jsonb_array_length(changed) = 0 then return NEW; end if;
  end if;

  -- an account being deleted takes its rows with it: the person no longer exists, so the entry has no actor
  if actor is not null and not exists (select 1 from public.profiles where id = actor) then actor := null; end if;
  if actor is not null then select email into actor_email from public.profiles where id = actor; end if;

  insert into public.audit_logs (actor_id, actor_email, action, entity_type, entity_id, details)
  values (
    actor, actor_email,
    TG_TABLE_NAME || case TG_OP when 'INSERT' then '.created' when 'UPDATE' then '.updated' else '.deleted' end,
    TG_TABLE_NAME, rid,
    jsonb_strip_nulls(jsonb_build_object('owner_id', owner, 'changed', case when jsonb_array_length(changed) > 0 then changed end))
  );
  return case when TG_OP = 'DELETE' then OLD else NEW end;
exception when others then
  -- the trail must never stop someone saving their own data
  return case when TG_OP = 'DELETE' then OLD else NEW end;
end;
$$;

do $$
declare t text;
begin
  foreach t in array array[
    'grocery_receipts', 'personal_expenses', 'personal_projects', 'personal_spends', 'personal_budgets',
    'savings_plans', 'savings_events', 'reminders', 'loyalty_cards', 'utility_bills', 'fixed_costs', 'fixed_entries',
    'fuel_fillups', 'travel_documents', 'trip_flights', 'trip_papers', 'business_projects', 'business_project_receipts',
    'shares', 'sharing_settings', 'bill_email_senders',
    'subscriptions', 'plan_payments', 'user_plans', 'profiles', 'account_requests', 'support_requests'
  ] loop
    if to_regclass('public.' || t) is not null then
      execute format('drop trigger if exists %I on public.%I', t || '_audit', t);
      execute format('create trigger %I after insert or update or delete on public.%I for each row execute function public.write_audit_light()', t || '_audit', t);
    end if;
  end loop;
end $$;
