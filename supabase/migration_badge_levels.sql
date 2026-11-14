-- Community badge levels are higher now: Scout 150, Guardian 750, Champion 2,500, Legend 4,000 shared prices.
-- Run in the Supabase SQL Editor (safe to run more than once). Earned badges stay as they are.
create or replace function public._badge_level(total integer) returns smallint
language sql immutable as $$
  select (case when total >= 4000 then 5 when total >= 2500 then 4 when total >= 750 then 3 when total >= 150 then 2 when total >= 1 then 1 else 0 end)::smallint
$$;

update public.help_topics set body = replace(replace(replace(replace(body,
  E'**Scout:** 50 prices', E'**Scout:** 150 prices'),
  E'**Guardian:** 200 prices', E'**Guardian:** 750 prices'),
  E'**Champion:** 500 prices', E'**Champion:** 2,500 prices'),
  E'**Legend:** 1,000 prices', E'**Legend:** 4,000 prices')
where slug = 'community-badges' and body like '%**Legend:** 1,000 prices%';

notify pgrst, 'reload schema';
