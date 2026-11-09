-- Setup check. READ ONLY: it changes nothing. Paste it into the Supabase SQL Editor and run it.
--
-- It returns one list. Look at the "status" column:
--   OK        this is in place
--   MISSING   run the file named in "fix" (in the supabase folder of the repo), then run this check again
--   REVIEW    something the app does not use (or a switch that is off); decide if you want to remove it
-- Problems are listed first, so scroll to the top.

with
-- ---------- what the app expects ----------
want_tables(name, fix) as (values
  ('profiles','schema.sql'), ('trips','schema.sql'), ('expenses','schema.sql'), ('app_settings','migration_branding_roles.sql'),
  ('roles','migration_roles.sql'), ('categories','migration_categories.sql'), ('currencies','migration_currencies.sql'),
  ('travel_categories','migration_travel_categories.sql'), ('travel_documents','migration_documents.sql'),
  ('personal_projects','migration_personal.sql'), ('personal_expenses','migration_personal.sql'),
  ('grocery_receipts','migration_personal.sql'), ('grocery_items','migration_personal.sql'), ('grocery_categories','migration_grocery_categories.sql'),
  ('audit_logs','migration_audit.sql'), ('security_events','migration_security_hardening.sql'), ('auth_throttle','migration_security_hardening.sql'),
  ('support_requests','migration_login_support.sql'),
  ('telegram_pending','migration_telegram.sql'), ('telegram_notify_prefs','migration_telegram_v2.sql'), ('telegram_sent_log','migration_telegram_v2.sql'),
  ('telegram_admin_actions','migration_telegram_admin.sql'), ('app_secrets','migration_telegram_admin.sql'), ('telegram_updates','migration_telegram_v4.sql'),
  ('loyalty_cards','migration_loyalty.sql'), ('help_topics','migration_help.sql'),
  ('sharing_settings','migration_sharing.sql'), ('partnerships','migration_sharing.sql'), ('shares','migration_sharing.sql'),
  ('share_activity','migration_sharing_safety.sql'), ('push_subscriptions','migration_sharing_safety.sql'), ('account_deletions','migration_sharing_safety.sql'),
  ('subscriptions','migration_subscriptions.sql'), ('iptv_clients','migration_subscriptions.sql'), ('iptv_renewals','migration_subscriptions.sql'), ('iptv_customers','migration_iptv_customers.sql')
),
want_columns(tbl, col, fix) as (values
  ('profiles','role','migration_admin.sql'), ('profiles','must_change_password','migration_admin.sql'),
  ('profiles','first_name','migration_profile.sql'), ('profiles','last_name','migration_profile.sql'), ('profiles','title','migration_profile.sql'), ('profiles','avatar_url','migration_profile.sql'),
  ('profiles','home_country','migration_home_place.sql'), ('profiles','home_city','migration_home_place.sql'),
  ('profiles','telegram_id','migration_telegram.sql'), ('profiles','telegram_link_code','migration_telegram.sql'), ('profiles','telegram_link_expires','migration_telegram.sql'), ('profiles','telegram_default_trip_id','migration_telegram.sql'),
  ('profiles','temp_password_issued_at','migration_temp_password.sql'), ('profiles','temp_password_expires_at','migration_temp_password.sql'),
  ('expenses','exchange_rate','migration_currency.sql'), ('expenses','amount_usd','migration_currency.sql'), ('expenses','image_hash','migration_duplicates.sql'),
  ('trips','destination','migration_trip_fields.sql'), ('trips','category','migration_trip_fields.sql'),
  ('travel_documents','document_number','migration_documents_number.sql'),
  ('categories','icon','migration_travel_categories.sql'),
  ('grocery_items','unit','migration_personal.sql'),
  ('app_settings','login_logo_size','migration_login_support.sql'), ('app_settings','privacy_policy','migration_login_support.sql'), ('app_settings','support_email','migration_login_support.sql'),
  ('app_settings','personal_enabled','migration_personal.sql'),
  ('app_settings','telegram_enabled','migration_telegram.sql'), ('app_settings','telegram_bot_username','migration_telegram.sql'),
  ('telegram_pending','saved_ref','migration_telegram_v2.sql'), ('telegram_pending','saved_path','migration_telegram_v2.sql'),
  ('profiles','dismissed_notices','migration_dismissed_notices.sql'), ('loyalty_cards','back_image_path','migration_loyalty_back.sql'),
  ('app_settings','sharing_disabled','migration_sharing.sql'), ('profiles','push_prefs','migration_sharing_safety.sql'),
  ('app_settings','client_links_disabled','migration_subscriptions.sql'), ('app_settings','iptv_contact','migration_subscriptions.sql'), ('iptv_clients','customer_id','migration_iptv_customers.sql')
),
want_functions(name, fix) as (values
  ('find_duplicate_expenses','migration_duplicates.sql'), ('handle_new_user','schema.sql'), ('has_permission','migration_roles.sql'),
  ('personal_touch_updated_at','migration_personal.sql'), ('protect_profile_privileges','migration_security_hardening.sql'),
  ('purge_old_logs','migration_throttle_retention.sql'), ('throttle_hit','migration_security_hardening.sql'),
  ('throttle_reset','migration_security_hardening.sql'), ('throttle_status','migration_security_hardening.sql'), ('write_audit','migration_audit.sql'),
  ('end_partnership','migration_sharing.sql'), ('invite_partner','migration_sharing.sql'), ('respond_to_invite','migration_sharing.sql'), ('set_sharing','migration_sharing.sql'),
  ('share_item','migration_sharing.sql'), ('unshare_item','migration_sharing.sql'), ('shared_loyalty_cards','migration_sharing.sql'), ('shared_trips','migration_sharing.sql'),
  ('shared_loyalty_photo_path','migration_sharing.sql'), ('sharing_active_count','migration_sharing.sql'), ('sharing_available','migration_sharing.sql'),
  ('sharing_drop_item_shares','migration_sharing.sql'), ('sharing_email_of','migration_sharing.sql'), ('sharing_gate','migration_sharing.sql'),
  ('sharing_integrity_check','migration_sharing.sql'), ('sharing_is_on','migration_sharing.sql'), ('sharing_log','migration_sharing.sql'),
  ('sharing_my_email','migration_sharing.sql'), ('sharing_name','migration_sharing.sql'), ('sharing_other','migration_sharing.sql'),
  ('sharing_overview','migration_sharing.sql'), ('sharing_trip_failsafe','migration_sharing.sql'),
  ('log_share_view','migration_sharing_safety.sql'), ('sharing_activity','migration_sharing_safety.sql'), ('sharing_activity_export','migration_sharing_safety.sql'),
  ('share_activity_purge','migration_sharing_safety.sql'), ('share_activity_partnership','migration_sharing_safety.sql'), ('share_activity_share','migration_sharing_safety.sql'),
  ('sharing_item_label','migration_sharing_safety.sql'), ('push_user_by_email','migration_sharing_safety.sql'), ('push_other_party','migration_sharing_safety.sql'),
  ('push_share_partner','migration_sharing_safety.sql'), ('push_view_owner','migration_sharing_safety.sql'), ('account_deletions_due','migration_sharing_safety.sql'),
  ('iptv_is_admin','migration_subscriptions.sql'), ('iptv_renew','migration_subscriptions.sql'), ('iptv_create_link','migration_subscriptions.sql'),
  ('iptv_stop_link','migration_subscriptions.sql'), ('iptv_link_user','migration_subscriptions.sql'), ('iptv_unlink_user','migration_subscriptions.sql'),
  ('iptv_public_view','migration_subscriptions.sql'), ('iptv_customer_view','migration_iptv_customers.sql'), ('iptv_subscription_shape','migration_iptv_customers.sql'), ('my_iptv_subscriptions','migration_subscriptions.sql')
),
want_triggers(name, fix) as (values
  ('on_auth_user_created','schema.sql'), ('profiles_protect_privileges','migration_security_hardening.sql'),
  ('trips_audit','migration_audit_triggers.sql'), ('expenses_audit','migration_audit_triggers.sql'),
  ('personal_projects_touch','migration_personal.sql'), ('personal_expenses_touch','migration_personal.sql'),
  ('help_topics_touch','migration_help.sql'), ('loyalty_cards_touch','migration_loyalty.sql'),
  ('loyalty_cards_drop_shares','migration_sharing.sql'), ('trips_drop_shares','migration_sharing.sql'), ('personal_projects_drop_shares','migration_sharing.sql'),
  ('partnerships_activity','migration_sharing_safety.sql'), ('shares_activity','migration_sharing_safety.sql'),
  ('subscriptions_touch','migration_subscriptions.sql'), ('iptv_clients_touch','migration_subscriptions.sql'), ('iptv_customers_touch','migration_iptv_customers.sql')
),
want_buckets(id, fix) as (values
  ('receipts','create it in Storage (private); see schema.sql'), ('documents','migration_documents.sql'),
  ('branding','create it in Storage (public); see migration_branding_roles.sql'), ('avatars','create it in Storage (public); see migration_profile.sql'),
  ('loyalty-cards','migration_loyalty.sql')
),
-- tables used only by the server: row security on and no rule for people is correct
server_only(name) as (values ('telegram_pending'), ('telegram_updates'), ('app_secrets'), ('telegram_sent_log'), ('telegram_admin_actions'), ('auth_throttle'), ('sharing_settings'), ('partnerships'), ('shares'), ('share_activity')),

-- ---------- what the database has ----------
have_tables as (
  select c.relname as name, c.relrowsecurity as rls
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relkind in ('r', 'p')
),
have_columns as (select table_name::text as tbl, column_name::text as col from information_schema.columns where table_schema = 'public'),
have_functions as (
  select distinct p.proname::text as name
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and not exists (select 1 from pg_depend d where d.objid = p.oid and d.deptype = 'e')
),
have_triggers as (select distinct t.tgname::text as name from pg_trigger t where not t.tgisinternal),
have_buckets as (select id::text as id from storage.buckets),
policy_count as (select tablename::text as name, count(*) as n from pg_policies where schemaname = 'public' group by tablename),

report as (
  select 1 as ord, 'Table' as area, w.name::text as item,
         case when h.name is null then 'MISSING' else 'OK' end as status,
         case when h.name is null then w.fix else '' end as fix
  from want_tables w left join have_tables h on h.name = w.name

  union all
  select 2, 'Column', w.tbl || '.' || w.col,
         case when h.col is null then 'MISSING' else 'OK' end,
         case when h.col is null then w.fix else '' end
  from want_columns w left join have_columns h on h.tbl = w.tbl and h.col = w.col

  union all
  select 3, 'Function', w.name, case when h.name is null then 'MISSING' else 'OK' end, case when h.name is null then w.fix else '' end
  from want_functions w left join have_functions h on h.name = w.name

  union all
  select 4, 'Trigger', w.name, case when h.name is null then 'MISSING' else 'OK' end, case when h.name is null then w.fix else '' end
  from want_triggers w left join have_triggers h on h.name = w.name

  union all
  select 5, 'Storage bucket', w.id, case when h.id is null then 'MISSING' else 'OK' end, case when h.id is null then w.fix else '' end
  from want_buckets w left join have_buckets h on h.id = w.id

  union all
  -- without row security, anyone holding the public key could read the table
  select 6, 'Row security', t.name::text,
         case when t.rls then 'OK' else 'MISSING' end,
         case when t.rls then '' else 'alter table public.' || t.name || ' enable row level security;' end
  from have_tables t join want_tables w on w.name = t.name

  union all
  -- row security on but no rules: right for server-only tables, a problem for the rest
  select 7, 'Access rules', w.name::text,
         case when coalesce(p.n, 0) > 0 or s.name is not null then 'OK' else 'MISSING' end,
         case when coalesce(p.n, 0) > 0 or s.name is not null then '' else 'no policy, so signed-in people cannot reach it; re-run ' || w.fix end
  from want_tables w
  join have_tables h on h.name = w.name
  left join policy_count p on p.name = w.name
  left join server_only s on s.name = w.name

  -- the next checks count rows with query_to_xml, so they still run when a table or column is missing
  union all
  select 8, 'Starting data', 'app_settings row (id 1)',
         case when t.name is null then 'MISSING'
              when (xpath('/row/c/text()', query_to_xml('select count(*) as c from public.app_settings where id = 1', false, true, '')))[1]::text::int > 0 then 'OK'
              else 'MISSING' end,
         'migration_branding_roles.sql'
  from (select 1) x left join have_tables t on t.name = 'app_settings'

  union all
  select 8, 'Starting data', 'role: ' || r.key,
         case when t.name is null then 'MISSING'
              when (xpath('/row/c/text()', query_to_xml('select count(*) as c from public.roles where key = ' || quote_literal(r.key), false, true, '')))[1]::text::int > 0 then 'OK'
              else 'MISSING' end,
         'migration_roles.sql'
  from (values ('user'), ('assistant'), ('admin')) r(key) left join have_tables t on t.name = 'roles'

  union all
  select 8, 'Starting data', 'at least one admin account',
         case when t.name is null or not exists (select 1 from have_columns where tbl = 'profiles' and col = 'role') then 'MISSING'
              when (xpath('/row/c/text()', query_to_xml('select count(*) as c from public.profiles where role = ''admin''', false, true, '')))[1]::text::int > 0 then 'OK'
              else 'MISSING' end,
         'set role = admin on your profile row'
  from (select 1) x left join have_tables t on t.name = 'profiles'

  union all
  select 9, 'Switch', 'Telegram turned on in Settings',
         case when exists (select 1 from have_columns where tbl = 'app_settings' and col = 'telegram_enabled')
                   and (xpath('/row/c/text()', query_to_xml('select count(*) as c from public.app_settings where id = 1 and telegram_enabled', false, true, '')))[1]::text::int > 0
              then 'OK' else 'REVIEW' end,
         'Admin, Settings, Telegram: turn it on if you want the bot'

  union all
  select 9, 'Switch', 'Personal section turned on',
         case when exists (select 1 from have_columns where tbl = 'app_settings' and col = 'personal_enabled')
                   and (xpath('/row/c/text()', query_to_xml('select count(*) as c from public.app_settings where id = 1 and personal_enabled', false, true, '')))[1]::text::int > 0
              then 'OK' else 'REVIEW' end,
         'Admin, Settings: turn it on if people should see Personal'

  union all
  -- things in the database that the app does not use: candidates to remove
  select 10, 'Extra table', t.name::text, 'REVIEW', 'Not used by the app. If you did not create it yourself it can go: drop table public.' || t.name || ' cascade;'
  from have_tables t where t.name not in (select name from want_tables)

  union all
  select 11, 'Extra function', f.name, 'REVIEW', 'Not used by the app. Check what it is before dropping it.'
  from have_functions f where f.name not in (select name from want_functions)

  union all
  select 12, 'Extra storage bucket', b.id, 'REVIEW', 'Not used by the app. Empty it and delete it in Storage if you do not need it.'
  from have_buckets b where b.id not in (select id from want_buckets)

  union all
  -- storage rules: without them uploads to the private buckets are refused
  select 14, 'Storage rule', w.name,
         case when exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname = w.name) then 'OK' else 'MISSING' end,
         case when exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname = w.name) then '' else w.fix end
  from (values
    ('Own receipts read','migration_storage_policies.sql'), ('Own receipts insert','migration_storage_policies.sql'),
    ('Own receipts update','migration_storage_policies.sql'), ('Own receipts delete','migration_storage_policies.sql'),
    ('Own avatar insert','migration_storage_policies.sql'), ('Own avatar update','migration_storage_policies.sql'), ('Own avatar delete','migration_storage_policies.sql'),
    ('Admins can upload branding','migration_roles.sql'), ('Admins can update branding','migration_roles.sql')
  ) w(name, fix)

  union all
  -- Driver's license must be an allowed document type
  select 15, 'Constraint', 'travel_documents allows driver''s license',
         case when not exists (select 1 from have_tables where name = 'travel_documents') then 'MISSING'
              when exists (select 1 from pg_constraint where conname = 'travel_documents_kind_check' and pg_get_constraintdef(oid) like '%license%') then 'OK'
              else 'MISSING' end,
         'migration_documents_license.sql'

  union all
  -- starter Help topics (an admin may have deleted some on purpose: then it is REVIEW, not an error)
  select 16, 'Help topic', w.slug,
         case when not exists (select 1 from have_tables where name = 'help_topics') then 'MISSING'
              when (xpath('/row/c/text()', query_to_xml('select count(*) as c from public.help_topics where slug = ' || quote_literal(w.slug), false, true, '')))[1]::text::int > 0 then 'OK'
              else 'REVIEW' end,
         w.fix
  from (values
    ('add-to-home-screen','migration_help.sql'), ('share-with-partner','migration_help.sql'), ('connect-telegram','migration_help_telegram.sql'),
    ('create-a-trip','migration_help_guides.sql'), ('add-a-trip-receipt','migration_help_guides.sql'),
    ('import-grocery-receipt','migration_help_guides.sql'), ('export-trip-report','migration_help_guides.sql')
  ) w(slug, fix)

  union all
  -- the "loyalty" role option is switched on for the user and assistant roles (admin always has everything)
  select 17, 'Role option', r.key || ' has loyalty',
         case when not exists (select 1 from have_tables where name = 'roles') then 'MISSING'
              when (xpath('/row/c/text()', query_to_xml('select count(*) as c from public.roles where key = ' || quote_literal(r.key) || ' and ''loyalty'' = any (known_features)', false, true, '')))[1]::text::int > 0 then 'OK'
              else 'REVIEW' end,
         'migration_loyalty.sql'
  from (values ('user'), ('assistant')) r(key)

  union all
  select 13, 'Data check', 'documents without a file',
         case when n.c = 0 then 'OK' else 'REVIEW' end,
         case when n.c = 0 then '' else n.c::text || ' document(s) have no file attached; open Documents and add the file or delete them' end
  from (
    select case when exists (select 1 from have_tables where name = 'travel_documents')
                then (xpath('/row/c/text()', query_to_xml('select count(*) as c from public.travel_documents where file_path is null', false, true, '')))[1]::text::int
                else 0 end as c
  ) n
)
select area, item, status, fix
from report
order by case status when 'MISSING' then 0 when 'REVIEW' then 1 else 2 end, ord, item;
