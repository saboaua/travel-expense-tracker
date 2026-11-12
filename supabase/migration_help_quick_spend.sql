-- Migration 54: Help topics "Record a purchase with no receipt (Quick spend)" and "Add a grocery receipt by hand" (Personal).
-- Run in the Supabase SQL Editor (safe to run more than once). Needs migration_help.sql first.
-- Added only the first time: after that, edit them in Admin > Help (a re-run never overwrites your edits).

insert into public.help_topics (slug, title, category, summary, body, sort_order) values
('quick-spend', 'Record a purchase with no receipt (Quick spend)', 'Personal',
 'Bought a coffee or street food and got no receipt? Add it in a few taps so your personal spending stays complete.',
$h$Quick spend is for small personal purchases that come with no receipt: a coffee, peanuts from a street vendor, a bus fare. It counts toward your personal spending.

> Quick spend is only for **Personal**. Business expenses still need a receipt or invoice and are added under **Trips**.

## Add a spend
1. Open **Personal** and tap **Quick spend**.
2. Type the **amount**. The currency starts as **AWG**; tap **USD** or pick another currency if you paid in it.
3. Type **what it was**, for example "Coffee". Your recent names show below as chips: tap one to fill in the name, the category and the last amount.
4. Choose a **category**: Coffee & snacks, Street food, Transport, Personal care, House or Other.
5. Choose the **date**: Today, Yesterday, or **Pick a date**.
6. Add a **note** if you like, then tap **Save spend**.

## See what you spent
Under **This month** you see every quick spend of the month and the total. To remove one by mistake, tap the bin next to it.

## No signal?
You can still save. The spend is kept on your phone, marked **waiting to send**, and sent by itself when you are back online.

## Good to know
- A quick spend is never added to a business trip.
- Quick spends are private to you, like the rest of Personal.
- Online store prices in the Price tracker are only for comparison and are never added to what you spent.$h$, 20),
('add-grocery-receipt-by-hand', 'Add a grocery receipt by hand', 'Personal',
 'Camera not working, or no photo of the receipt? Type the store, the date and the items yourself.',
$h$If you cannot scan a grocery receipt, because the camera does not work or you have no photo, you can type it in.

## Add it
1. Open **Personal**, then **Groceries**, then **Scan receipt**.
2. Tap **Camera not working? Add by hand**. The photo step goes away.
3. Type the **store** and pick the **date**.
4. Tap **Add item** for each thing you bought and fill in the name, the quantity and the price. Items are optional.
5. Check the **receipt total**. If you added items, Lifolio shows whether they add up to the total.
6. Tap **Save receipt**.

## Items or just a total?
- **With items:** each item shows up in the **Price tracker**, so you can see how its price changes over time.
- **With only a total:** the receipt counts toward your monthly grocery spending, but not toward price comparison.

Changed your mind? Tap **Scan a photo instead** to go back to the camera.

## Good to know
- Offline works too: the receipt is saved on your phone and sent when you are back online.
- No receipt at all, for example a small purchase from a street vendor? Use **Quick spend** instead.$h$, 21)
on conflict (slug) do nothing;
