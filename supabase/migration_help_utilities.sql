-- Migration 57: Help topic "Keep track of your utility bills" (Personal).
-- Run in the Supabase SQL Editor (safe to run more than once). Needs migration_help.sql first.
-- Added only the first time: after that, edit it in Admin > Help (a re-run never overwrites your edits).

insert into public.help_topics (slug, title, category, summary, body, sort_order) values
('utility-bills', 'Keep track of your utility bills', 'Personal',
 'Water, electricity, septic, trash, phone and internet: add each bill yourself, then look back at what you paid and when.',
$h$Lifolio is not connected to your utility companies, so it cannot read your bills. You add each bill yourself: it takes a minute, and then you can always trace back what you paid and when.

## Add a bill
1. Open **Personal**, then **Utilities**, then tap **Add bill**.
2. Choose the **utility**: Water, Electricity, Septic, Trash, Phone, Internet or Other.
3. Type the **company**. Lifolio remembers it for next time.
4. Pick the **month** the bill is for and type the **amount**. The currency starts as **AWG**.
5. Choose **Paid** (and the date you paid) or **Not paid yet** (and the due date, if you know it).
6. Optionally add a **photo of the bill** and a **note**, for example the account number or a meter reading.
7. Tap **Save bill**.

## See the month
The **Utilities** page shows the month's total, how it compares with last month, and each utility with its amount and whether it is paid. A utility you have added before shows **No bill yet** until you add that month's bill, so you can see what is missing. A bill that is **Not paid yet** is marked in amber until you mark it paid.

## Look back
Tap a utility to see its history: a bar for each of the last six months, the average and the highest, and every bill with its payment date, note and photo. Tap a bill to change or delete it.

## Get a reminder
Tap **Remind me to add bills** and choose a day of the month. On that day you get a phone alert if a utility you usually pay has no bill yet for the month. The reminder is your own; it does not know your company's due dates. Turn on phone alerts first (see **Turn on phone alerts**), and keep **Payment reminders** on.

## Good to know
- No signal? The bill is saved on your phone and sent when you are back online.
- Bills are private to you, like the rest of Personal.$h$, 22)
on conflict (slug) do nothing;
