-- Finishes the help updates that check_setup.sql still reports as MISSING for migration_help_fixed_costs.sql.
-- Why: that file only changes the older help topics while they still have the original wording, so a topic that was edited
-- is skipped. This file never replaces anything: it ADDS a short section to the end of a topic that lacks the new text.
-- Safe to run more than once. Run in the Supabase SQL Editor.

-- 1. The fixed-costs topic itself (only if it is missing)
insert into public.help_topics (slug, title, category, summary, body, sort_order, published)
select 'fixed-costs', 'Fixed costs: mortgage, insurance, car, credit card and gambling limit', 'Personal',
 'Set a payment once and it is added to your monthly spending for you. Loans, insurances, credit card and a gambling limit.',
$h$**Fixed costs** are the payments that come back every month or every year. Set them once and they are added to your spending and your monthly budget for you.

## Open it
1. Open **Personal**.
2. Tap **Fixed costs** under **Keep handy**, or **Set up fixed costs** on the budget card.
3. Pick **Loans**, **Insurances and car plate**, **Credit card** or **Gambling limit**.

## What you can set
- **Loans:** a mortgage or car loan, with its monthly amount and end date.
- **Insurances and car plate:** home insurance, yearly car insurance and the license plate.
- **Credit card:** a monthly amount, or each statement as you get it.
- **Gambling limit:** the most you can afford to set aside each month, with a log of what you spend and warnings at 80% and when you pass it.$h$, 25, true
where not exists (select 1 from public.help_topics where slug = 'fixed-costs');

-- 2. Best Prices
update public.help_topics set
  body = body || E'\n\n## Best Prices search\nOpen **Groceries**, **Best Prices** and search any product. It shows the cheapest place from your own receipts, community prices and online price lists.'
where slug = 'best-store' and body not like '%Best Prices%';

-- 3. Community prices
update public.help_topics set
  body = body || E'\n\n## See community prices\nOpen **Groceries**, **Best Prices** and search for a product. The Price tracker also shows a community price when it is cheaper than what you paid.\nIn **Profile**, **Community prices**, tap the red **Delete what I shared** button to remove what you shared.'
where slug = 'community-prices' and body not like '%Best Prices%';

-- 4. Phone alerts
update public.help_topics set
  body = body || E'\n\n## Budget and fixed-cost alerts\n- **Budget alerts:** at 80% of your monthly budget, and again if you go over.\n- **Gambling limit:** at 80% of your limit, and again when you pass it.\n- **Yearly bills coming up:** 30 days and 7 days before car insurance or the license plate is due.\n- **Monthly payment day:** the day before a mortgage, loan, insurance or card payment. Off until you turn it on.\n- **Community badges:** one alert when you reach a new level for sharing prices.'
where slug = 'turn-on-notifications' and body not like '%Gambling limit:%';

notify pgrst, 'reload schema';
