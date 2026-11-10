-- Migration 39: Help topics for phone alerts and for the new Subscriptions section.
-- Run in the Supabase SQL Editor (safe to run more than once). Needs migration_help.sql first.
-- Each topic is added only the first time: after that, edit it in Admin > Help (a re-run never overwrites your edits).

insert into public.help_topics (slug, title, category, summary, body, sort_order) values
('turn-on-notifications', 'Turn on phone alerts', 'Getting started',
 'Get a message on your phone when a payment, a trip or a sharing invite needs you, even when the app is closed.',
$h$Phone alerts tell you that something needs you, even when the app is closed. They never show card numbers, trip details or amounts. They only say that something happened.

## What you need
- The app **added to your Home Screen** (on iPhone and iPad this is required, see "Add the app to your home screen").
- Alerts allowed for the app in your phone's **Settings, Notifications**.

## Turn alerts on
1. Open the app from its Home Screen icon.
2. Go to **Profile** and open **Notifications**.
3. Switch on **Alerts on this device**, then tap **Allow** when your phone asks.
4. Tap **Send a test alert**. A message should arrive within a few seconds.

## Choose what you hear about
Under **Tell me about**, switch each kind on or off:
- **Invites and replies:** someone invites you to share, or answers your invite.
- **Shared with me changed:** a partner shares, updates or stops sharing something.
- **Payment and expiry reminders:** a subscription payment is coming up, within the days you set on that subscription.
- **Trips coming up:** a reminder three days and one day before a trip starts.
- **When someone opens my shared items:** off by default.

> Alerts are saved per device. Turn them on again on each phone or tablet you use.

## If the test alert does not arrive
- Check the phone is not on **Focus** or **Do Not Disturb**. Silent mode only mutes the sound.
- Check **Settings, Notifications** allows the app.
- Switch **Alerts on this device** off and on again.
- Still nothing? Tell an administrator, the message shown under the button says what went wrong.$h$, 25),

('track-subscriptions', 'Track your subscriptions', 'Personal',
 'Keep every subscription in one place, see what you spend each month, and get a reminder before each payment.',
$h$Subscriptions is a private list of what you pay for, for example streaming, software or a gym. Only you can see it.

## Add a subscription
1. Open **Personal**, then **Subscriptions**.
2. Tap **Add**.
3. Fill in the **name**, **price**, **currency** and how often it is **billed**.
4. Set the **next payment** date. If there is a free trial, add the **trial end** date too.
5. Tap **Save**.

## What you see
- **You spend per month:** every subscription worked out to a monthly amount, so weekly, quarterly and yearly ones are comparable.
- **Coming up:** the payments due soonest, with how many days are left.

## Get reminded
Each subscription has **Remind me (days before)**. A day or so before the date you pick, you get a phone alert (turn on alerts first, see "Turn on phone alerts").

## Share a cost
If you split a subscription with others, set **Split between (people)** and the app shows your share.

## Stop paying
Open the subscription and tap **Mark cancelled** (or **Pause**). If you saved a **Cancel link**, **Open cancel page** takes you straight there.$h$, 35)
on conflict (slug) do nothing;
