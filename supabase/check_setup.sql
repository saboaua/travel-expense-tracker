-- Lifolio setup check. Read-only: it changes nothing. Run in the Supabase SQL Editor.
-- Every row says OK or MISSING. MISSING rows come first, with the migration that fixes them.
-- If nothing is MISSING, the first row says "ALL GOOD".

with
need_cols(tbl, col, fix) as (values
  -- Personal: quick spends and house
  ('personal_spends','project_id','migration_personal.sql / migration_house_spend.sql'),
  ('personal_spends','receipt_path','migration_house_spend.sql'),
  ('personal_spends','house_area','migration_house_areas.sql'),
  ('personal_spends','exchange_rate','migration_personal.sql'),
  ('personal_spends','amount_usd','migration_personal.sql'),
  -- Utilities (paid date and bill month)
  ('utility_bills','bill_month','migration_utilities.sql'),
  ('utility_bills','paid_on','migration_utilities.sql'),
  ('utility_bills','due_date','migration_utilities.sql'),
  ('utility_bills','provider','migration_utilities.sql'),
  ('utility_bills','receipt_path','migration_utilities.sql'),
  ('utility_bills','amount_usd','migration_utilities.sql'),
  ('utility_bills','source','migration_bill_emails.sql'),
  ('utility_bills','dedupe_key','migration_bill_emails.sql'),
  ('utility_bills','needs_check','migration_bill_emails.sql'),
  ('bill_email_log','status','migration_bill_emails.sql'),
  ('bill_email_senders','accounts','migration_bill_email_accounts.sql'),
  ('profiles','welcome_seen_at','migration_welcome_tour.sql'),
  ('profiles','welcome_tracks','migration_welcome_tour.sql'),
  ('bill_email_log','account','migration_bill_email_accounts.sql'),
  ('utility_prefs','remind_day','migration_utilities.sql'),
  -- Groceries
  ('grocery_receipts','prices_only','migration_price_notes.sql'),
  -- Budget
  ('personal_budgets','month','migration_budget.sql'),
  ('personal_budgets','limits','migration_budget.sql'),
  ('personal_budgets','alert_at_80','migration_budget.sql'),
  -- Savings
  ('savings_plans','opening_balance','migration_savings.sql'),
  ('savings_plans','goal','migration_savings.sql'),
  ('savings_plans','paused_on','migration_savings.sql'),
  ('savings_plans','pauses','migration_audit_fixes.sql'),
  ('savings_events','plan_id','migration_savings.sql'),
  ('savings_events','kind','migration_savings.sql'),
  ('savings_events','month','migration_savings.sql'),
  -- Price tracker
  ('price_checks','product','migration_price_notes.sql'),
  ('price_checks','photo_path','migration_price_notes.sql')
),
col_checks as (
  select 'column' as area, n.tbl || '.' || n.col as item,
         case when c.column_name is not null then 'OK' else 'MISSING' end as status,
         n.fix as run_this
  from need_cols n
  left join information_schema.columns c
    on c.table_schema = 'public' and c.table_name = n.tbl and c.column_name = n.col
),
need_tables(tbl, fix) as (values
  ('house_areas','migration_house_areas.sql'),
  ('utility_bills','migration_utilities.sql'),
  ('bill_email_addresses','migration_bill_emails.sql'),
  ('bill_email_senders','migration_bill_emails.sql'),
  ('bill_email_log','migration_bill_emails.sql'),
  ('utility_prefs','migration_utilities.sql'),
  ('personal_budgets','migration_budget.sql'),
  ('savings_plans','migration_savings.sql'),
  ('savings_events','migration_savings.sql'),
  ('price_checks','migration_price_notes.sql'),
  ('help_topics','migration_help.sql')
),
table_checks as (
  select 'table', n.tbl,
         case when t.tablename is null then 'MISSING' when not t.rowsecurity then 'NO ROW SECURITY' else 'OK' end,
         n.fix
  from need_tables n
  left join pg_tables t on t.schemaname = 'public' and t.tablename = n.tbl
),
other_checks as (
  select 'policy', 'savings_events: own plans only',
         case when exists (select 1 from pg_policies where schemaname='public' and tablename='savings_events' and policyname='Own savings events'
                           and with_check ilike '%savings_plans%') then 'OK' else 'MISSING' end,
         'migration_audit_fixes.sql'
  union all
  select 'policy', 'house_areas: category managers',
         case when exists (select 1 from pg_policies where schemaname='public' and tablename='house_areas' and policyname='Category managers manage house areas')
              and not exists (select 1 from pg_policies where schemaname='public' and tablename='house_areas' and policyname='Admins manage house areas')
              then 'OK' else 'MISSING' end,
         'migration_audit_fixes.sql'
  union all
  select 'index', 'savings_events: one skip per month',
         case when exists (select 1 from pg_indexes where schemaname='public' and indexname='savings_events_skip_idx') then 'OK' else 'MISSING' end,
         'migration_audit_fixes.sql'
  union all
  select 'constraint', 'personal_budgets: limits is an object',
         case when exists (select 1 from pg_constraint where conname='personal_budgets_limits_object') then 'OK' else 'MISSING' end,
         'migration_audit_fixes.sql'
  union all
  select 'index', 'utility_bills: one bill per email',
         case when exists (select 1 from pg_indexes where schemaname='public' and indexname='utility_bills_dedupe_idx') then 'OK' else 'MISSING' end,
         'migration_bill_emails.sql'
  union all
  select 'help topic', s.slug,
         case when to_regclass('public.help_topics') is not null
              and (xpath('/row/c/text()', query_to_xml(format('select count(*) as c from public.help_topics where slug = %L', s.slug), false, true, '')))[1]::text::int > 0
              then 'OK' else 'MISSING' end,
         'migration_help_budget_savings.sql'
  from (values ('house-areas'), ('monthly-budget'), ('savings-plans')) as s(slug)
  union all
  select 'help topic', s.slug,
         case when to_regclass('public.help_topics') is not null
              and (xpath('/row/c/text()', query_to_xml(format('select count(*) as c from public.help_topics where slug = %L', s.slug), false, true, '')))[1]::text::int > 0
              then 'OK' else 'MISSING' end,
         'migration_help_bill_emails.sql'
  from (values ('bills-from-email'), ('bills-from-email-problems')) as s(slug)
),
all_checks as (
  select * from col_checks
  union all select * from table_checks
  union all select * from other_checks
)
select 0 as ord, 'summary' as area,
       case when count(*) filter (where status <> 'OK') = 0
            then 'ALL GOOD'
            else count(*) filter (where status <> 'OK') || ' thing(s) to fix' end as item,
       count(*) || ' checks' as status, null::text as run_this
from all_checks
union all
select case when status = 'OK' then 2 else 1 end, area, item, status, case when status = 'OK' then null else run_this end
from all_checks
order by 1, 2, 3;
