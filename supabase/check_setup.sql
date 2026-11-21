-- Lifolio setup check. Read-only: it changes nothing. Run in the Supabase SQL Editor.
-- Every row says OK or MISSING. MISSING rows come first, with the migration that fixes them.
-- If nothing is MISSING, the first row says "ALL GOOD".

with
need_cols(tbl, col, fix) as (values
  -- Support: AI summary
  ('support_requests','ai_summary','migration_support_ai.sql'),
  ('support_requests','ai_steps','migration_support_ai.sql'),
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
  ('utility_bills','payment_ref','migration_utility_payment_ref.sql'),
  ('payment_settings','btc_enabled','migration_pro_bitcoin.sql'),
  ('plan_payments','btc_address','migration_pro_bitcoin.sql'),
  ('plan_payments','claimed_at','migration_pro_bitcoin.sql'),
  ('pro_limits','free_ai_scans','migration_pro_limits.sql'),
  ('pro_limits','starts_trip_papers','migration_limit_starts.sql'),
  ('pro_limits','starts_projects','migration_projects.sql'),
  ('pro_limits','starts_trip_reports','migration_trip_reports.sql'),
  ('pro_limits','free_projects','migration_projects.sql'),
  ('pro_limits','pro_projects','migration_projects.sql'),
  ('business_projects','status','migration_projects.sql'),
  ('business_project_receipts','amount_usd','migration_projects.sql'),
  ('business_projects','client_name','migration_projects.sql'),
  ('business_project_receipts','receipt_path','migration_projects.sql'),
  ('pro_trial_settings','days','migration_pro_trial.sql'),
  ('trip_papers','note','migration_trip_papers.sql'),
  ('trip_checklist_items','done','migration_trip_checklist.sql'),
  ('entry_card_details','passport_number','migration_entry_card.sql'),
  ('trip_entry_cards','done_at','migration_entry_card.sql'),
  ('btc_addresses','derive_index','migration_pro_bitcoin_xpub.sql'),
  ('profiles','business_logo_path','migration_report_logo.sql'),
  ('personal_projects','project_type','migration_project_types_plans.sql'),
  ('personal_projects','type_label','migration_project_types_plans.sql'),
  ('personal_projects','type_icon','migration_project_types_plans.sql'),
  ('personal_projects','type_color','migration_project_types_plans.sql'),
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
  ('profiles','home_lat','migration_home_gps.sql'),
  ('profiles','home_lng','migration_home_gps.sql'),
  ('profiles','share_prices','migration_shared_prices.sql'),
  ('shared_prices','price','migration_shared_prices.sql'),
  ('shared_prices','contributor','migration_shared_prices.sql'),
  ('price_imports','file_hash','migration_community_confirm.sql'),
  ('fuel_fillups','quantity','migration_fuel.sql'),
  ('price_share_secret','salt','migration_shared_prices.sql'),
  ('account_requests','phone','migration_account_requests.sql'),
  ('account_requests','status','migration_account_requests.sql'),
  ('account_requests','referred_by','migration_invites.sql'),
  ('invite_links','code','migration_invites.sql'),
  ('fixed_costs','schedule','migration_fixed_costs.sql'),
  ('fixed_costs','end_month','migration_fixed_costs.sql'),
  ('fixed_costs','label','migration_license_plates.sql'),
  ('grocery_categories','area','migration_shopping_categories.sql'),
  ('fixed_entries','on_date','migration_fixed_costs.sql'),
  ('profiles','push_prefs','migration_sharing_safety.sql'),
  ('profiles','shared_total','migration_badges.sql'),
  ('profiles','badge_best','migration_badges.sql'),
  ('profiles','badge_seen','migration_badges.sql'),
  ('profiles','badge_pushed','migration_badges.sql'),
  ('profiles','share_last_at','migration_nightly_share.sql'),
  ('profiles','share_last_count','migration_nightly_share.sql'),
  ('profiles','share_last_error','migration_nightly_share.sql'),
  -- Prices by country
  ('supermarket_places','country','migration_country.sql'),
  ('shared_prices','country','migration_country.sql'),
  ('store_catalog','country','migration_country.sql'),
  ('profiles','share_countries','migration_country.sql'),
  ('profiles','traveler_seen','migration_country.sql'),
  -- Best store for your list
  ('shopping_list_items','product_key','migration_basket.sql'),
  ('store_locations','lat','migration_basket.sql'),
  ('supermarket_places','name_key','migration_supermarket_places.sql'),
  ('supermarket_places','fixed','migration_places_fix.sql'),
  ('supermarket_places','orig_lat','migration_places_fix.sql'),
  ('supermarket_places','orig_key','migration_places_fix.sql'),
  -- Price tracker
  ('price_checks','product','migration_price_notes.sql'),
  ('price_checks','photo_path','migration_price_notes.sql'),
  -- Paid with
  ('grocery_receipts','paid_with','migration_paid_with.sql'),
  ('grocery_receipts','trip_ref','migration_paid_with.sql'),
  ('personal_expenses','paid_with','migration_paid_with.sql'),
  ('subscriptions','paid_with','migration_subscription_paid_with.sql'),
  ('grocery_receipts','area','migration_shopping_area.sql')
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
  ('user_plans','migration_project_types_plans.sql'),
  ('payment_settings','migration_pro_payments.sql'),
  ('plan_payments','migration_pro_payments.sql'),
  ('btc_addresses','migration_pro_bitcoin.sql'),
  ('btc_wallet','migration_pro_bitcoin_xpub.sql'),
  ('pro_limits','migration_pro_limits.sql'),
  ('pro_trial_settings','migration_pro_trial.sql'),
  ('trip_papers','migration_trip_papers.sql'),
  ('trip_checklist_items','migration_trip_checklist.sql'),
  ('entry_card_details','migration_entry_card.sql'),
  ('trip_entry_cards','migration_entry_card.sql'),
  ('business_projects','migration_projects.sql'),
  ('business_project_receipts','migration_projects.sql'),
  ('ai_scan_usage','migration_pro_limits.sql'),
  ('bill_email_held','migration_pro_limits.sql'),
  ('utility_bills','migration_utilities.sql'),
  ('bill_email_addresses','migration_bill_emails.sql'),
  ('bill_email_senders','migration_bill_emails.sql'),
  ('bill_email_log','migration_bill_emails.sql'),
  ('utility_prefs','migration_utilities.sql'),
  ('personal_budgets','migration_budget.sql'),
  ('savings_plans','migration_savings.sql'),
  ('savings_events','migration_savings.sql'),
  ('price_checks','migration_price_notes.sql'),
  ('help_topics','migration_help.sql'),
  ('profiles','the base setup (schema.sql)'),
  ('trips','the base setup (schema.sql)'),
  ('expenses','the base setup (schema.sql)'),
  ('personal_spends','migration_quick_spend.sql'),
  ('grocery_receipts','migration_personal.sql'),
  ('grocery_items','migration_personal.sql'),
  ('shopping_list_items','migration_basket.sql'),
  ('grocery_item_rules','migration_shopping_categories.sql'),
  ('store_locations','migration_basket.sql'),
  ('supermarket_places','migration_supermarket_places.sql'),
  ('supermarket_places_removed','migration_places_fix.sql'),
  ('shared_prices','migration_shared_prices.sql'),
  ('price_imports','migration_community_confirm.sql'),
  ('fuel_fillups','migration_fuel.sql'),
  ('price_share_secret','migration_shared_prices.sql'),
  ('account_requests','migration_account_requests.sql'),
  ('invite_links','migration_invites.sql'),
  ('fixed_costs','migration_fixed_costs.sql'),
  ('fixed_entries','migration_fixed_costs.sql'),
  ('push_subscriptions','migration_sharing_safety.sql'),
  ('push_sent_log','migration_push_alerts.sql'),
  ('push_queue','migration_push_alerts.sql'),
  ('price_share_seen','migration_badges.sql'),
  ('loyalty_cards','migration_loyalty.sql'),
  ('travel_documents','migration_documents.sql'),
  ('subscriptions','migration_subscriptions.sql'),
  ('accounting_settings','migration_accounting.sql'),
  ('accounting_exports','migration_accounting.sql')
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
  select 'constraint', 'fixed_costs: up to 3 license plates',
         case when exists (select 1 from pg_constraint where conname='fixed_costs_kind_check' and pg_get_constraintdef(oid) like '%license_plate_3%') then 'OK' else 'MISSING' end,
         'migration_license_plates.sql'
  union all
  select 'constraint', 'fixed_costs: up to 3 car insurances',
         case when exists (select 1 from pg_constraint where conname='fixed_costs_kind_check' and pg_get_constraintdef(oid) like '%car_insurance_3%') then 'OK' else 'MISSING' end,
         'migration_car_insurances.sql'
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
  union all
  select 'help topic', s.slug,
         case when to_regclass('public.help_topics') is not null
              and (xpath('/row/c/text()', query_to_xml(format('select count(*) as c from public.help_topics where slug = %L', s.slug), false, true, '')))[1]::text::int > 0
              then 'OK' else 'MISSING' end,
         'migration_help_trip_checklist.sql'
  from (values ('trip-checklist')) as s(slug)
  union all
  select 'function', f.fn,
         case when exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = f.fn) then 'OK' else 'MISSING' end,
         f.fix
  from (values ('share_prices','migration_shared_prices.sql'), ('community_search','migration_shared_prices.sql'), ('import_prices','migration_community_confirm.sql'), ('my_shared_count','migration_shared_prices.sql'),
               ('unshare_my_prices','migration_shared_prices.sql'), ('unshare_prices_of','migration_shared_prices.sql'), ('_price_contributor_of','migration_shared_prices.sql'),
               ('sharing_activity_export','migration_sharing_safety.sql'),
               ('grocery_receipt_categories','migration_dashboard_rollup.sql'),
               ('trip_expense_totals','migration_trip_totals.sql'),
               ('share_prices_for','migration_nightly_share.sql'), ('share_failed_for','migration_nightly_share.sql'), ('claim_badge_alert_for','migration_nightly_share.sql'), ('my_badge_for','migration_nightly_share.sql'),
               ('my_badge','migration_badges.sql'), ('ack_badge','migration_badges.sql'), ('claim_badge_alert','migration_badges.sql'), ('_badge_level','migration_badges.sql'),
               ('price_countries','migration_country.sql'), ('my_traveler','migration_country.sql'), ('ack_traveler','migration_country.sql'), ('_country_of_currency','migration_country.sql'), ('_note_countries','migration_country.sql'),
               ('my_invite','migration_invites.sql'), ('reset_my_invite','migration_invites.sql'), ('set_invite_show_name','migration_invites.sql')) as f(fn, fix)
  union all
  select 'function', 'community_search takes a country',
         case when exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = 'community_search' and p.pronargs = 3) then 'OK' else 'MISSING' end,
         'migration_country.sql'
  union all
  select 'function', 'community_search shows Confirmed',
         case when exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = 'community_search' and pg_get_function_result(p.oid) like '%confirmed%') then 'OK' else 'MISSING' end,
         'migration_community_confirm.sql'
  union all
  select 'privacy', 'shared_prices: nobody can read it directly',
         case when to_regclass('public.shared_prices') is null then 'MISSING'
              when exists (select 1 from information_schema.role_table_grants where table_schema='public' and table_name='shared_prices' and grantee in ('anon','authenticated','PUBLIC')) then 'OPEN: re-run migration_shared_prices.sql'
              else 'OK' end,
         'migration_shared_prices.sql'
  union all
  select 'privacy', 'account_requests: only the server can read it',
         case when to_regclass('public.account_requests') is null then 'MISSING'
              when exists (select 1 from information_schema.role_table_grants where table_schema='public' and table_name='account_requests' and grantee in ('anon','authenticated','PUBLIC')) then 'OPEN: re-run migration_account_requests.sql'
              else 'OK' end,
         'migration_account_requests.sql'
  union all
  select 'privacy', 'invite_links: nobody can read it directly',
         case when to_regclass('public.invite_links') is null then 'MISSING'
              when exists (select 1 from information_schema.role_table_grants where table_schema='public' and table_name='invite_links' and grantee in ('anon','authenticated','PUBLIC')) then 'OPEN: re-run migration_invites.sql'
              else 'OK' end,
         'migration_invites.sql'
  union all
  select 'trigger', 'email stays in step when a person changes it',
         case when exists (select 1 from pg_trigger t join pg_class c on c.oid = t.tgrelid join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'auth' and c.relname = 'users' and t.tgname = 'on_auth_user_email_changed') then 'OK' else 'MISSING' end,
         'migration_email_sync.sql'
  union all
  select 'privacy', 'price_share_seen: nobody can read it',
         case when to_regclass('public.price_share_seen') is null then 'MISSING'
              when exists (select 1 from information_schema.role_table_grants where table_schema='public' and table_name='price_share_seen' and grantee in ('anon','authenticated','PUBLIC')) then 'OPEN: re-run migration_badges.sql'
              else 'OK' end,
         'migration_badges.sql'
  union all
  select 'privacy', 'price_share_secret: nobody can read it',
         case when to_regclass('public.price_share_secret') is null then 'MISSING'
              when exists (select 1 from information_schema.role_table_grants where table_schema='public' and table_name='price_share_secret' and grantee in ('anon','authenticated','PUBLIC')) then 'OPEN: re-run migration_shared_prices.sql'
              else 'OK' end,
         'migration_shared_prices.sql'
  union all
  select 'privacy', 'shared_prices: holds no receipt date column',
         case when to_regclass('public.shared_prices') is null then 'MISSING'
              when exists (select 1 from information_schema.columns where table_schema='public' and table_name='shared_prices' and column_name in ('date','purchase_date','created_at','user_id','email')) then 'REVIEW: unexpected column'
              else 'OK' end,
         'migration_shared_prices.sql'
  union all
  select 'data', 'price_share_secret has its one row',
         case when to_regclass('public.price_share_secret') is not null
              and (xpath('/row/c/text()', query_to_xml('select count(*) as c from public.price_share_secret', false, true, '')))[1]::text::int = 1
              then 'OK' else 'MISSING' end,
         'migration_shared_prices.sql'
  union all
  select 'storage', b.id,
         case when exists (select 1 from storage.buckets sb where sb.id = b.id) then 'OK' else 'MISSING' end,
         'migration_storage_policies.sql / the base setup'
  from (values ('receipts'), ('loyalty-cards'), ('documents')) as b(id)
  union all
  select 'help topic', s.slug,
         case when to_regclass('public.help_topics') is not null
              and (xpath('/row/c/text()', query_to_xml(format('select count(*) as c from public.help_topics where slug = %L', s.slug), false, true, '')))[1]::text::int > 0
              then 'OK' else 'MISSING' end,
         'migration_help_best_store.sql'
  from (values ('best-store'), ('search-help')) as s(slug)
  union all
  select 'help topic', s.slug,
         case when to_regclass('public.help_topics') is not null
              and (xpath('/row/c/text()', query_to_xml(format('select count(*) as c from public.help_topics where slug = %L', s.slug), false, true, '')))[1]::text::int > 0
              then 'OK' else 'MISSING' end,
         'migration_help_fixed_costs.sql'
  from (values ('fixed-costs')) as s(slug)
  union all
  select 'help topic', 'change-email',
         case when to_regclass('public.help_topics') is not null
              and (xpath('/row/c/text()', query_to_xml('select count(*) as c from public.help_topics where slug = ''change-email''', false, true, '')))[1]::text::int > 0
              then 'OK' else 'MISSING' end,
         'migration_help_accounts.sql'
  union all
  select 'help topic', 'community-badges',
         case when to_regclass('public.help_topics') is not null
              and (xpath('/row/c/text()', query_to_xml('select count(*) as c from public.help_topics where slug = ''community-badges''', false, true, '')))[1]::text::int > 0
              then 'OK' else 'MISSING' end,
         'migration_help_badges.sql'
  union all
  select 'function', 'badge levels: Legend at 4,000',
         case when to_regprocedure('public._badge_level(integer)') is null then 'MISSING'
              when public._badge_level(3999) = 4 and public._badge_level(4000) = 5 and public._badge_level(149) = 1 and public._badge_level(150) = 2 then 'OK'
              else 'MISSING' end,
         'migration_badge_levels.sql'
  union all
  -- the wording updates inside older help topics (migration_help_fixed_costs.sql)
  select 'help wording', w.label,
         case when to_regclass('public.help_topics') is null then 'MISSING'
              when (xpath('/row/c/text()', query_to_xml(format('select count(*) as c from public.help_topics where slug = %L and body like %L', w.slug, w.good), false, true, '')))[1]::text::int > 0 then 'OK'
              when (xpath('/row/c/text()', query_to_xml(format('select count(*) as c from public.help_topics where slug = %L', w.slug), false, true, '')))[1]::text::int = 0 then 'OK'
              else 'MISSING' end,
         'migration_help_fixed_costs.sql / migration_help_nightly.sql'
  from (values ('Best Prices topic', 'best-store', '%Best Prices%'),
               ('Community prices topic', 'community-prices', '%Best Prices%'),
               ('Phone alerts topic', 'turn-on-notifications', '%Gambling limit:%'),
               ('Nightly share in Community prices topic', 'community-prices', '%once a night%'),
               ('No guessed prices in Best Prices topic', 'best-store', '%No guessed prices%'),
               ('Badge levels in the Community badges topic', 'community-badges', '%**Legend:** 4,000 prices%')) as w(label, slug, good)
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
