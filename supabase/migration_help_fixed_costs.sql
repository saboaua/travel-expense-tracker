-- Help for Best Prices and Fixed costs. Run in the Supabase SQL Editor (safe to run more than once). Needs migration_help.sql first.
-- New topics are added only the first time. The two older topics (Best store, Community prices) are updated only while they still say the old thing,
-- so a topic an admin has already edited is never overwritten.

insert into public.help_topics (slug, title, category, summary, body, sort_order, published) values
('fixed-costs', 'Fixed costs: mortgage, insurance, car, credit card and gambling limit', 'Personal',
 'Set a payment once and it is added to your monthly spending for you. Loans, insurances, credit card and a gambling limit.',
$h$**Fixed costs** are the payments that come back every month or every year. Set them once and they are added to your spending and your monthly budget for you.

## Open it
1. Open **Personal**.
2. Tap **Fixed costs** under **Keep handy**, or **Set up fixed costs** on the budget card.

## Loans
- **Home mortgage:** type the **Monthly payment**, the day it is paid, when it started and the **Last payment** month. It is added every month until then. Leave the last payment empty if you do not know it.
- **Car loan:** open **My car**, switch **Car loan** on, type the monthly payment and the last payment month. It is optional: switch it off when the loan is paid.

## Insurances
- **Home insurance:** the same form as the mortgage: the monthly amount and the last payment month.
- **Car insurance** is paid **once a year**. Type the yearly amount and the month it is due. It is added to your spending in that month only.
- **License plate** is paid every year. Choose **Once a year**, or **Two payments** if you pay it in two parts (it costs a little more). Each payment is added in the month it is due.

## Credit card
- **Same amount every month:** type the amount that is deducted and the day.
- **I enter what I spent:** add the total on your statement with its date. It counts in that month.

## Gambling limit
1. Open **Gambling limit** and type **what you can afford each month**. Tap **Save limit**.
2. Tap **Add what you spent** each time you spend, with the date.
3. You see how much is left. You get a warning at **80%** and a red message when you pass the limit.
Only you see this.

## See it in your budget
On **Personal**, the budget card has a row for **Loans**, **Insurances**, **Credit card** and **Gambling**. They count in what you spent this month. **Coming up** lists yearly bills that are not due yet.

## Change or stop one
Open it from **Fixed costs**, change the amount or the dates and tap **Save**. Tap **Stop this payment** to remove it. What it added to past months stays in those months.

> If gambling stops feeling like fun, talk to someone you trust.$h$, 25, true)
on conflict (slug) do nothing;

-- Best store became Best Prices: a search over your receipts, community prices and online price lists, and the list and map below it
update public.help_topics set
  title = 'Best Prices: find the cheapest price and the cheapest store',
  summary = 'Search any item to see the best price from your receipts, community prices and online price lists. Below it, build a list and find the cheapest store near you.',
  body = $h$**Best Prices** shows where an item is cheapest, and which store is cheapest for your whole shopping list.

## Search an item
1. Open **Personal**, **Groceries**, then **Best Prices**.
2. Type an item at the top, for example **Corona**, and tap **Search**.
3. You see every price found, cheapest first. The best one is marked **Best price** with the store.
4. A label says where each price comes from: **Your receipt**, **Community** (the middle price of 3 or more people) or **Online price list**.

The search works whether or not you share your own prices.

## Your list and the map
Under the search, **Best store for your list** adds up your list at every store you have receipts from and shows the stores on a map.
1. Tap an item under **Your usual items**, or search for an item you bought before. The ones marked **due** are things you are likely to need again.
2. Use **+** and **−** for how many.
3. Choose your radius. Stores you have prices for are numbered **1, 2, 3** from cheapest.

## Set where you start from
- **On your phone:** tap **Use my location**. It is used on this screen only and is not saved.
- **On a computer, or with location off:** save your **Home GPS point** in **Profile**, **Home place**. Best Prices then measures from home.

## Read the answer
- Each store shows the total for your list, the distance, and **Best price** on the first one.
- **5 of 6 priced · 1 estimated** means one item was never bought there. Its price is estimated and labelled.
- **1 old price** means a price is older than 60 days.
- **Price level** compares each store with the average store. A store needs 5 products also seen elsewhere, otherwise it says **Not enough data**.

## If it does not work
- **The map does not load:** check your connection. Prices still show without it.
- **"Location is off":** allow location for this site in your browser, or save a Home GPS point instead.$h$
where slug = 'best-store' and title like 'Find the cheapest store%';

-- Community prices: the lookup is now in Best Prices
update public.help_topics set
  body = replace(replace(body,
    E'## See community prices\nOpen **Groceries**, **Price tracker**, **Community prices**. Search for a product.',
    E'## See community prices\nOpen **Groceries**, **Best Prices** and search for a product. The Price tracker also shows a community price when it is cheaper than what you paid.'),
    E'In **Profile**, **Community prices**, tap **Delete what I shared**.',
    E'In **Profile**, **Community prices**, tap the red **Delete what I shared** button.')
where slug = 'community-prices' and body like '%Price tracker**, **Community prices**%';

-- Phone alerts: the new switches (only while the topic still has the original text)
update public.help_topics set
  body = replace(body,
    E'- **Trips coming up:** a reminder three days and one day before a trip starts.',
    E'- **Trips coming up:** a reminder three days and one day before a trip starts.\n- **Budget alerts:** at 80% of your monthly budget, and again if you go over.\n- **Gambling limit:** at 80% of your limit, and again when you pass it.\n- **Yearly bills coming up:** 30 days and 7 days before car insurance or the license plate is due.\n- **Monthly payment day:** the day before a mortgage, loan, insurance or card payment. Off until you turn it on.')
where slug = 'turn-on-notifications' and body like '%Trips coming up:%' and body not like '%Gambling limit:%';

notify pgrst, 'reload schema';
