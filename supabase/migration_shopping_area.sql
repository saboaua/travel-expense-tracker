-- Shopping gets its own page, apart from Groceries.
-- Each receipt belongs to one of the two. Run once in the Supabase SQL editor; safe to run again.
alter table public.grocery_receipts add column if not exists area text not null default 'groceries';

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'grocery_receipts_area_check') then
    alter table public.grocery_receipts add constraint grocery_receipts_area_check check (area in ('groceries', 'shopping'));
  end if;
end $$;

-- Receipts whose items are all Shopping (clothes, electronics, home and the other shopping categories) move to Shopping.
-- Nothing is deleted. Receipts with any grocery item, and receipts with no items, stay in Groceries.
update public.grocery_receipts r
set area = 'shopping'
where r.area = 'groceries'
  and exists (select 1 from public.grocery_items i where i.receipt_id = r.id)
  and not exists (
    select 1 from public.grocery_items i
    where i.receipt_id = r.id
      and lower(trim(i.category)) not in (
        select lower(name) from public.grocery_categories where area = 'shopping'
        union select unnest(array['stationery & art','clothing','electronics','toys & games','garden & hardware','pharmacy','shopping'])
      )
  );
