-- Duplicate receipt detection. Safe to run more than once. Run in the Supabase SQL Editor.
--
-- Adds a small "fingerprint" of each receipt photo and a function that finds the signed-in person's own
-- expenses that look like the one being saved: same photo, or same shop + date + amount.

alter table public.expenses add column if not exists image_hash text;   -- 16 hex characters (64-bit perceptual hash)
create index if not exists idx_expenses_user_date on public.expenses (user_id, expense_date);

-- Returns up to p_limit of YOUR expenses that look like a duplicate.
--  * same_details: same shop (ignoring case and punctuation), amount within 1% (at least 0.05) in the same
--                  currency, and a date within one day.
--  * same_photo:   the photo fingerprints differ in at most 2 of 64 bits (a copy of the same picture: re-saved,
--                  resized, forwarded). Near-blank fingerprints are ignored. Two different receipts that share a
--                  layout can occasionally look alike, which is why this only ever warns; it never blocks.
-- Runs as the caller, so the normal row-level rules apply: nobody can see anyone else's expenses.
create or replace function public.find_duplicate_expenses(
  p_merchant text,
  p_amount numeric,
  p_currency text,
  p_date date,
  p_image_hash text default null,
  p_limit int default 5
)
returns table (
  id uuid, trip_id uuid, trip_name text, merchant text, amount numeric, currency text,
  expense_date date, reason text, distance int
)
language sql stable security invoker set search_path = public as $$
  with q as (
    select nullif(regexp_replace(lower(coalesce(p_merchant, '')), '[^a-z0-9]', '', 'g'), '') as m,
           case when p_image_hash ~ '^[0-9a-f]{16}$'
                     and bit_count(('x' || p_image_hash)::bit(64)) between 8 and 56 then p_image_hash end as h
  ),
  c as (
    select e.id, e.trip_id, e.merchant, e.amount, e.currency, e.expense_date,
           regexp_replace(lower(coalesce(e.merchant, '')), '[^a-z0-9]', '', 'g') as em,
           case when q.h is not null and e.image_hash ~ '^[0-9a-f]{16}$'
                     and bit_count(('x' || e.image_hash)::bit(64)) between 8 and 56
                then bit_count(('x' || e.image_hash)::bit(64) # ('x' || q.h)::bit(64))::int end as dist,
           q.m as qm
    from public.expenses e, q
    where e.user_id = auth.uid()
  ),
  f as (
    select c.*,
           (c.qm is not null and p_amount is not null and p_date is not null
            and c.em <> ''
            and c.expense_date between p_date - 1 and p_date + 1
            and coalesce(c.currency, '') = coalesce(p_currency, '')
            and abs(c.amount - p_amount) <= greatest(0.05, abs(p_amount) * 0.01)
            and (c.em = c.qm
                 or (length(c.em) >= 3 and length(c.qm) >= 3
                     and (position(c.qm in c.em) > 0 or position(c.em in c.qm) > 0)))) as same_details,
           (c.dist is not null and c.dist <= 2) as same_photo
    from c
  )
  select f.id, f.trip_id, t.name, f.merchant, f.amount, f.currency, f.expense_date,
         case when f.same_details and f.same_photo then 'both'
              when f.same_photo then 'same_photo' else 'same_details' end,
         f.dist
  from f
  left join public.trips t on t.id = f.trip_id
  where f.same_details or f.same_photo
  order by (f.same_details and f.same_photo) desc, f.same_photo desc, f.dist nulls last, f.expense_date desc
  limit greatest(1, least(coalesce(p_limit, 5), 20));
$$;

revoke all on function public.find_duplicate_expenses(text, numeric, text, date, text, int) from public, anon;
grant execute on function public.find_duplicate_expenses(text, numeric, text, date, text, int) to authenticated;
