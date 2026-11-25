-- Shows only what is MISSING from the latest migrations. Empty result = everything is in place.
-- Run it in the Supabase SQL Editor, then run the file named in the last column for each row.
with need(tbl, col, file) as (values
  ('grocery_receipts','country','migration_receipt_country.sql'),
  ('price_checks','country','migration_receipt_country.sql'),
  ('grocery_receipts','online_site','migration_online_orders.sql'),
  ('grocery_receipts','arrives_on','migration_online_orders.sql'),
  ('grocery_receipts','order_ref','migration_online_email.sql'),
  ('grocery_receipts','source','migration_online_email.sql'),
  ('grocery_receipts','needs_check','migration_online_email.sql'),
  ('telegram_notify_prefs','kinds','migration_telegram_kinds.sql'),
  ('pro_limits','starts_orders_email','migration_orders_email_limit.sql'),
  ('supermarket_places','category','migration_directory_categories.sql'),
  ('supermarket_places','added','migration_directory_categories.sql'),
  ('store_categories','category','migration_directory_categories.sql')
)
select n.tbl as "table", n.col as "missing column", n.file as "run this file"
from need n
left join information_schema.columns c on c.table_schema = 'public' and c.table_name = n.tbl and c.column_name = n.col
where c.column_name is null
order by n.file, n.tbl, n.col;
