-- Migration 59: Help topic "Keep prices without spending" (Personal).
-- Run in the Supabase SQL Editor (safe to run more than once). Needs migration_help.sql first.
-- Added only the first time: after that, edit it in Admin > Help (a re-run never overwrites your edits).

insert into public.help_topics (slug, title, category, summary, body, sort_order) values
('price-notes', 'Keep prices without spending', 'Personal',
 'Save a receipt only for its prices, or note a price you saw in a shop, and compare stores later.',
$h$Sometimes you want a price on record without it counting as your spending: you bought something for someone else, or you are checking shops before you buy.

## A receipt you did not pay for
1. Open **Groceries**, then **Scan receipt** (or **Add by hand**).
2. Under **Whose purchase is this?** choose **Just keeping the prices**.
3. Check the store, date and items, then tap **Save prices**.

The items go to the **Price tracker**, but the receipt is left out of your spending, budget and reports. In your list it shows a grey amount and a **Prices only** tag. Edit the receipt any time to switch it back to **I paid for it**.

## A price you saw in a shop
1. Open **Groceries**, then **Price check** (or **Add a price** in the Price tracker).
2. Type the **product** and the **store**, then the **price**. The currency starts as **AWG**.
3. Optionally add the **size** (for example 30 servings), a **photo of the shelf tag** and a note.
4. Tap **Save price**, or **Save and add another store** to keep the product and move to the next shop.

After saving you see the prices you have so far for that product, cheapest first.

## Compare stores
Open the **Price tracker** and find the product. Each store shows its latest price, and the cheapest is marked. Prices from receipts and from shop checks are compared together. Add the size to the product so the same size is matched at every store.

## Receipts typed by hand
**Add by hand** now lets you keep a photo of the receipt (it is kept, not read). A line with a price but no name is saved as Item 1, 2, 3. The currency you choose for a store is remembered for next time.

## Good to know
- No signal? Everything is saved on your phone and sent when you are back online.
- Shop prices are never counted as spending.$h$, 23)
on conflict (slug) do nothing;
