-- Weighed groceries: old lines with a fractional quantity (0.25, 0.61) and no unit are priced per kg.
-- Run once in the Supabase SQL Editor. Safe to run again.
update public.grocery_items
set unit = 'kg'
where unit is null
  and quantity > 0
  and quantity <> trunc(quantity);

select count(*) as weighed_lines_with_unit from public.grocery_items where unit = 'kg';
