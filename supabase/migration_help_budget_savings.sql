-- Migration 63: Help topics for House areas, the monthly budget and Savings plans (Personal).
-- Run in the Supabase SQL Editor (safe to run more than once). Needs migration_help.sql first.
-- Added only the first time: after that, edit them in Admin > Help (a re-run never overwrites your edits).

insert into public.help_topics (slug, title, category, summary, body, sort_order) values
('house-areas', 'Tag house spending by area', 'Personal',
 'Choose Kitchen, Bathroom, Roof or another area of the house for a spend, and see what each part costs.',
$h$When you spend on the house, you can say which **part of the house** it was for, as well as (or instead of) a home project.

## Tag a spend
1. Open **Personal**, then **Quick spend**.
2. Choose the category **House**. A **For the house** section appears.
3. Open **Part of a project or an area (optional)**. The list has two groups: **Your home projects** and **Areas of the house** (Kitchen, Bathroom, Roof, Garden and so on).
4. Pick one and save.

A **project** adds the spend to that project's total. An **area** only tags it, so you can see what each part of the house costs.

## See what each area costs
Open **House & repairs**. The filter buttons at the top include each area that has spending, next to your projects. Each row shows its project or area.

## Add or change the areas (administrators)
Open **Admin**, then **Categories**, then **House areas**. Add an area, rename it, change its icon, reorder it, hide it with **Enabled**, or delete it. Hiding or deleting an area does not change spends you already saved.

## Good to know
- No signal? The spend is saved on your phone and sent when you are back online.
- Areas count as house spending in your monthly budget.$h$, 24),
('monthly-budget', 'Set a monthly budget', 'Personal',
 'Say how much you plan to spend each month and see how your groceries, utilities, quick spends and house costs compare.',
$h$A monthly budget shows, on **Personal**, how much of your plan you have used and how much is left.

## Set your budget
1. Open **Personal** and tap **Set a monthly budget** (or **Set or change budget** once you have one).
2. Type the **budget per month** and choose **AWG** or **USD**.
3. Choose **Every month**, or **Only this month** if this month should be different.
4. Optionally turn on **Limits for each area** and type a limit for Groceries, Utilities, Quick spend and House. Leave a box empty for no limit.
5. Optionally turn on **Tell me at 80%**.
6. Tap **Save budget**.

## What the card shows
- How much is **left**, or how much you are **over**, and a bar of what you spent, with a colour for each area.
- A grey mark on the bar shows how far through the month you are, so you can see if you are spending faster than the month passes.
- **On track** under 80% of the budget, **Close to your budget** from 80%, and **Over budget** above it.
- Days left in the month and about how much you can spend a day.
- Each area with its own bar. An area that passes its limit turns red.

## What counts
Groceries (except receipts you kept only for their prices), utilities, quick spends, house spending and home project costs, and your savings plans. Amounts in another currency are converted to the budget's currency.

## The 80% alert
With **Tell me at 80%** on, you get one phone alert in the month when you reach 80% of the budget, and one more if you go over. It never shows an amount.

## Change or remove a budget
A budget for **Every month** applies until you change it. A budget for **Only this month** wins over it for that month alone. Open **Set or change budget** and tap **Remove this budget** to take either away.$h$, 25),
('savings-plans', 'Put money aside with a savings plan', 'Personal',
 'Set an amount that goes into savings every month, or until a date, and see how much you have saved so far.',
$h$A savings plan puts an amount aside every month by itself. You set it once, and Lifolio counts it each month and keeps the total.

## Add a plan
1. Open **Personal**, then **Savings**, then **Add a savings plan**.
2. Type a **name**, for example Emergency fund, and the **amount each month**.
3. Choose **Every month, no end** or **Every month until a date**. For an end date, pick the **last deposit**: you see how many deposits that makes and the total.
4. Pick the date of the **first deposit**. It repeats on the same day each month. A date in the past counts the months that have already gone by.
5. Optionally turn on **I already have savings** and type what you have saved so far. The plan starts from that amount.
6. Optionally turn on **Savings goal** to see how far along you are.
7. Tap **Save plan**.

## See how much you have saved
The **Savings** page shows the total saved so far, a chart of the total at the end of each month, and each plan with its amount, end date, progress toward the goal and next deposit.

## One plan
Tap a plan to see every month it deposited. From there you can:
- **Extra deposit**: add a one-off amount on top. It counts in the total and in the month you add it.
- **Skip a month**: leave the next deposit out. Tap **Undo** next to a skipped month to put it back.
- **Pause plan**: stop deposits from today. Tap **Resume plan** to start again.
- The pencil changes the plan. **Delete this plan** removes it and its history.

## In your budget
Each month's deposit counts as spending in your monthly budget, in its own teal **Savings** line, for the whole month. That money is already set aside. What you had saved before the plan (the starting balance) is not counted as spending.

## Good to know
- Withdrawals are not tracked. If you take money out, lower the plan or delete it and start a new one from what is left.
- A deposit on the 31st falls on the last day of shorter months.$h$, 26)
on conflict (slug) do nothing;
