-- Help topic: the monthly recap (Personal). Run in the Supabase SQL Editor (safe to run more than once). Needs migration_help.sql first.
-- Added only the first time: after that, edit it in Admin > Help (a re-run never overwrites your edits).

insert into public.help_topics (slug, title, category, summary, body, sort_order) values
('monthly-recap', 'Your monthly recap', 'Personal',
 'On the 1st, see how last month went: spent against your budget, what changed most, and what cheaper prices could have saved.',
$h$On the 1st of every month, Personal shows a short **recap** of the month that just ended.

## What it shows
- **Spent** against your monthly budget, with how far under or over you finished.
- **The biggest change** against the month before, for example "Groceries went up 12%". It only shows when something moved by at least 10% and about 25 in your budget currency, so it is never noise.
- **What you could have saved**, when the prices you have seen at other stores were lower for things you bought. It is an estimate from your own receipts and price notes, so it says "could have saved", and it is left out when the amount is small.

## Where to find it
1. The card is at the top of **Personal** for the first week of the month. Tap the cross to hide it.
2. After that, open **Last month's recap** at the bottom of the budget card.
3. Tap **See the full month** for every area with its share of the month. **Where it went** opens your reports.

## The message
You also get one message on the 1st: "Your October recap is ready. You finished under budget." It never includes an amount, because it can show on your lock screen. Tap it to open the recap.
- Phone: on by default. Change it in **Profile > Notifications > Monthly recap**.
- Telegram: off until you switch it on in the same place.

## Good to know
- No budget set? The recap still shows what you spent and what changed. Set a budget to see under or over.
- Spending in a currency that cannot be converted is left out, the same as in your budget.
- Only your own spending is used.$h$, 41)
on conflict (slug) do nothing;
