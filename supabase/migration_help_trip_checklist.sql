-- Help topic "Trip checklist: pack and do everything before you go" (Business trips).
-- Run in the Supabase SQL Editor (safe to run more than once). Needs migration_help.sql first.
-- Added only the first time: after that, edit it in Admin > Help (a re-run never overwrites your edits).

insert into public.help_topics (slug, title, category, summary, body, sort_order) values
('trip-checklist', 'Trip checklist: pack and do everything before you go', 'Business trips',
 'Keep a private to-do and packing list on each trip, copy it from an earlier trip to the same place, and get a reminder if things are still not ticked.',
$h$Each trip can have a checklist: things to pack and do before you go, like your passport, a charger, or printing the hotel booking. Only you see it, even on a trip you shared.

## Start a list
1. On the **Home** trip card, under Trip papers, tap **Make a checklist for this trip**. You can also open the trip and tap **Checklist**.
2. Pick a group (Documents, Clothes, Tech, Health or Other), type what you need and tap **Add**.
3. Tap the box next to a thing to tick it. Tap the bin to remove it.

The trip card shows how many things are ticked, for example **8 of 14**, and what is next. When everything is ticked it says **Everything is ready for the trip**.

## Copy a list from an earlier trip
If you made a list for the same place before, the trip card says **You have a Panama City list** and offers **Copy it**. Everything comes in **unticked**, and the same thing from two lists is added once.
- Been there more than once? You pick which lists to bring in.
- Want a different trip? Open the checklist, tap the **three dots**, then **Copy from an earlier trip**, and pick **Pick a different trip**.

> Lists are kept after a trip ends, so the next trip to the same place can copy them.

## Get a reminder
Open **Profile**, then **Phone alerts**, and turn on **Trip checklist**. If things are still not ticked, you get a reminder 2 days and 1 day before the trip starts. It only says how many are left, never what is on your list. Nothing is sent once everything is ticked.

## On the plane
Your checklist is saved on your phone with your other trip papers, so you can open it and tick things with no signal. Changes are sent when you are back online.

## Privacy
The checklist is private to you. It never appears in a report, an export for someone else, or anything you share.$h$, 46)
on conflict (slug) do nothing;
