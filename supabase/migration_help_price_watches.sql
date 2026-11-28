-- Help topic: price watches (Personal). Run in the Supabase SQL Editor (safe to run more than once). Needs migration_help.sql first.
-- Added only the first time: after that, edit it in Admin > Help (a re-run never overwrites your edits).

insert into public.help_topics (slug, title, category, summary, body, sort_order) values
('price-watches', 'Price watches', 'Personal',
 'Pick a product you buy and get a message when it gets cheaper, at the store you use or another one.',
$h$A **price watch** tells you when something you buy gets cheaper. You do not have to keep checking.

## Start a watch
1. Open **Personal > Groceries > Price tracker** and tap a product.
2. Tap **Watch this price**.
3. Choose when to be told:
   - **Cheaper than I last paid**: any price below what you paid last time.
   - **At or below**: a price you type, for example 3.80.
4. Tap **Start watching**.

You can also start from **Price watches** (top of the tracker): tap **Watch a product** and search.

## What is checked
Every morning the app compares your rule with:
- prices from your own receipts and price notes,
- prices shared by the community,
- the Super Food Plaza, Ling & Sons and Do it lists, only when the product is a confirmed match.

The price you last paid is not counted as a drop.

## The message
You get at most **one message a morning**. It names the product and the store, for example "Gouda 500g is cheaper at Super Food Plaza now." If several dropped, it says how many. It never includes a price, because it can show on your lock screen. Tap it to open **Price watches**.
- Phone: on by default. Change it in **Profile > Notifications > Price drops**.
- Telegram: off until you switch it on in the same place.

## Manage your watches
- The list shows what each one waits for. A green line shows **Dropped** with the price and store.
- Tap the pause button to stop a watch without losing it. Tap it again to resume.
- Tap a row to change the rule or **Stop watching**.
- A price is announced once. You are told again if it falls further, or after it has gone back above your rule and dropped again.

## Limits
Free accounts can watch 3 products. Pro can watch more. Tap **Get Pro for more watches** on the list to see the plans.$h$, 42)
on conflict (slug) do nothing;
