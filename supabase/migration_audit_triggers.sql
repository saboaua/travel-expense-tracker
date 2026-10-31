-- Audit trail for trips and expenses.
-- Run in the Supabase SQL Editor.

create or replace function public.write_audit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  actor uuid := auth.uid();
  actor_email text;
  action_name text;
  row_id text;
  payload jsonb;
begin
  if TG_OP = 'DELETE' then
    action_name := TG_TABLE_NAME || '.deleted';
    row_id := OLD.id::text;
    payload := to_jsonb(OLD);
    if actor is null then
      actor := nullif(payload->>'user_id', '')::uuid;
    end if;
  else
    action_name := TG_TABLE_NAME || case when TG_OP = 'INSERT' then '.created' else '.updated' end;
    row_id := NEW.id::text;
    payload := to_jsonb(NEW);
    if actor is null then
      actor := nullif(payload->>'user_id', '')::uuid;
    end if;
  end if;

  if actor is not null then
    select email into actor_email from public.profiles where id = actor;
  end if;

  insert into public.audit_logs (actor_id, actor_email, action, entity_type, entity_id, details)
  values (actor, actor_email, action_name, TG_TABLE_NAME, row_id, payload);

  return coalesce(NEW, OLD);
end;
$$;

drop trigger if exists trips_audit on public.trips;
create trigger trips_audit
  after insert or update or delete on public.trips
  for each row execute function public.write_audit();

drop trigger if exists expenses_audit on public.expenses;
create trigger expenses_audit
  after insert or update or delete on public.expenses
  for each row execute function public.write_audit();

-- Backfill existing rows so the trail is not empty
insert into public.audit_logs (actor_id, actor_email, action, entity_type, entity_id, details, created_at)
select t.user_id, p.email, 'trips.created', 'trips', t.id::text,
       jsonb_build_object('name', t.name, 'status', t.status, 'currency', t.currency),
       coalesce(t.created_at, now())
from public.trips t
left join public.profiles p on p.id = t.user_id
where not exists (
  select 1 from public.audit_logs a
  where a.entity_type = 'trips' and a.entity_id = t.id::text and a.action = 'trips.created'
);

insert into public.audit_logs (actor_id, actor_email, action, entity_type, entity_id, details, created_at)
select e.user_id, p.email, 'expenses.created', 'expenses', e.id::text,
       jsonb_build_object('merchant', e.merchant, 'amount', e.amount, 'currency', e.currency, 'category', e.category, 'trip_id', e.trip_id),
       coalesce(e.created_at, now())
from public.expenses e
left join public.profiles p on p.id = e.user_id
where not exists (
  select 1 from public.audit_logs a
  where a.entity_type = 'expenses' and a.entity_id = e.id::text and a.action = 'expenses.created'
);

notify pgrst, 'reload schema';
