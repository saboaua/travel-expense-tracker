-- Help topics for Best store (Personal): how to open the map, set your home point, and how to search Help.
-- Run in the Supabase SQL Editor (safe to run more than once). Needs migration_help.sql first.
-- Added only the first time: after that, edit them in Admin > Help (a re-run never overwrites your edits).

insert into public.help_topics (slug, title, category, summary, body, sort_order) values
('best-store', 'Find the cheapest store for your grocery list', 'Personal',
 'Build a list from what you usually buy, see the price at each store near you on a map, and which store is cheapest or most expensive overall.',
$h$**Best store** adds up your shopping list at every store you have receipts from, shows the stores on a map, and tells you where the list costs least.

## Open the map
1. Open **Personal**, then **Groceries**.
2. Tap the **Best store** map tile.
3. The map shows you, a circle for your radius, and each store. Stores you have prices for are numbered **1, 2, 3** from cheapest. Grey dots are other supermarkets with no receipts from you yet.

## Make your list
- Tap an item under **Your usual items**. The ones marked **due** are things you are likely to need again.
- Or search for an item you have bought before and tap it.
- Use **+** and **−** for how many. **Clear** empties the list.

## Set where you start from
- **On your phone:** tap **Use my location**. It is used on this screen only and is not saved.
- **On a computer, or with location off:** save your **Home GPS point**. Open **Profile**, then **Home place**, stand at home and tap **Save my home location**. Best store then measures from home. Switch between **Home** and **Where I am now** at the top of the page.
- The point is rounded to about 100 m and only you can see it. Tap **Remove** to delete it.

## Read the answer
- Each store shows the total for your list, the distance, and **Best price** on the first one.
- **5 of 6 priced · 1 estimated** means one item was never bought there. Its price is estimated and labelled.
- **1 old price** means a price is older than 60 days.
- Tap a store to see every line, and **Directions** to open it in your maps app.
- **Price level** shows how each store compares with the average store: **Cheapest**, **Below average**, **About average**, **Above average** or **Most expensive**. A store needs 5 products also seen elsewhere, otherwise it says **Not enough data**. Loyalty discounts are not included.

## A store is missing from the map
- A store shows on the map when its name on your receipt matches a supermarket place. An admin loads those places in **Admin**, **Supermarket places**.
- Standing at the store, tap **Pin here** under **Store places**.

## If it does not work
- **The map does not load:** check your connection. Prices still show without it.
- **"Location is off":** allow location for this site in your browser, or save a Home GPS point instead.$h$, 80),
('search-help', 'Search the Help section', 'Getting started',
 'Type a few words to find a topic fast, or browse by group. Where the search box is and how to get better results.',
$h$You do not need to read everything. Search finds the topic for you.

## Find the Help section
- **On a phone:** tap **Menu** at the bottom right, then **Help**.
- **On a computer:** choose **Help** in the left menu.

## Search
1. Tap the **Search help** box at the top.
2. Type one or two words, for example **map**, **bill**, **budget** or **photo**. Results appear as you type.
3. Tap a topic to open it. Tap the **X** in the box to clear the search and see every group again.

## Get better results
- Use the word you would say: **cheapest store** finds Best store, **bill email** finds the Gmail setup.
- Try a shorter word if nothing shows. Search looks in the title, the summary and the text.
- No search? Browse by group: **Getting started**, **Personal**, **Business trips**, **Your account**.

## Still stuck
Open **Replay the welcome tour** at the top of Help for a short walk through the app.$h$, 15)
on conflict (slug) do nothing;
