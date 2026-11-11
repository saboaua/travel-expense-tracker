-- Migration 47: Help topic "Add a flight to a trip" (Business trips).
-- Run in the Supabase SQL Editor (safe to run more than once). Needs migration_help.sql first.
-- Added only the first time: after that, edit it in Admin > Help (a re-run never overwrites your edits).

insert into public.help_topics (slug, title, category, summary, body, sort_order) values
('add-a-flight', 'Add a flight to a trip', 'Business trips',
 'Add your outbound and return flights, see live status, share them with a partner, and put them in your phone calendar.',
$h$Add the flights of a trip once and Lifolio keeps them in one place: the route, local times, live status, and a reminder in your phone calendar.

## Add a flight
1. Open the trip, find **Flights** and tap **Add flight**.
2. Choose **Outbound** or **Return** (you can add a connection too).
3. Type the **flight number**, like CM 312, and the **date**, then tap **Find flight**. The airline, route, times and status are filled in for you.
4. Optional: add your **confirmation code**, **seat** and **cabin**. These are only for you.
5. Tap **Save**.

Short on time? Tap **Scan ticket or boarding pass** and take a photo. The flight number and date are read for you.

## When the flight is not found
- **The flight is far away.** Live details are only available close to the flight. If the date is too far ahead, Lifolio switches to entering it by hand. Fill in the route and times yourself. On the day, Lifolio looks the flight up and fills in the live details.
- **Not found.** Check the number and the date, or enter the details by hand.

A flight added by hand shows **Added by hand**. One that is kept up to date shows **Flight sync active**.

## Live status
Close to departure the status updates by itself: **On time**, **Delayed**, **Boarding**, **In the air** or **Landed**. Times are always local to each airport. If a flight is delayed or cancelled you are told.

## See your flights
- On the **Business dashboard** the next trip shows your next flight, with the route, times and status. Tap **Flight details** to open it.
- On your phone, tap the flight to open its details.

## Add to your phone calendar
Open the flight and tap **Add to calendar**. Choose Apple, Google or Outlook, and pick a reminder (none, 3 hours or 1 day before).

## Share with a partner
When you share a trip with a partner, they see the dates and each flight (route, time and status) and can add it to their own calendar. They never see your confirmation code, seat, cabin or any amounts.

## Change or remove a flight
Open the trip, tap the flight, then **Edit** or **Remove**.$h$, 45)
on conflict (slug) do nothing;
