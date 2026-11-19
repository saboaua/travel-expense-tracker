-- Second pass for the Shopping area (run after migration_shopping_area.sql; safe to run again).
-- The first pass only moved receipts where EVERY line was a Shopping category. Store receipts such as Zara or Old Navy
-- often have a line still in "Other", so they stayed in Groceries. This moves a receipt to Shopping when its
-- Shopping lines add up to more than its grocery lines. Lines in "Other" are not counted either way.
-- Nothing is deleted. The result lists what moved, so you can check it.
with shop_names as (
  select lower(name) as n from public.grocery_categories where area = 'shopping'
  union select unnest(array['stationery & art','clothing','electronics','toys & games','garden & hardware','pharmacy','shopping'])
),
split as (
  select i.receipt_id,
    coalesce(sum(i.line_total) filter (where lower(trim(i.category)) in (select n from shop_names)), 0) as shop,
    coalesce(sum(i.line_total) filter (where lower(trim(i.category)) not in (select n from shop_names) and lower(trim(i.category)) <> 'other'), 0) as groc
  from public.grocery_items i
  group by i.receipt_id
)
update public.grocery_receipts r
set area = 'shopping'
from split s
where s.receipt_id = r.id and r.area = 'groceries' and s.shop > s.groc and s.shop > 0
returning r.store, r.purchase_date, r.total, r.currency;
