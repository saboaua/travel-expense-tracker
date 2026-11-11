-- Migration 48: Help topic "Use Lifolio offline" (Getting started).
-- Run in the Supabase SQL Editor (safe to run more than once). Needs migration_help.sql first.
-- Added only the first time: after that, edit it in Admin > Help (a re-run never overwrites your edits).

insert into public.help_topics (slug, title, category, summary, body, sort_order) values
('use-offline', 'Use Lifolio offline', 'Getting started',
 'No signal on a trip? Keep working: your cards, documents and trips are saved on your phone, and what you add is sent when you are back online.',
$h$Lifolio keeps a copy of your pages on your phone, so you can keep using it with no signal, on a plane or abroad. Anything you add while offline waits on your phone and is sent by itself when you are back online. Nothing is lost.

## Get ready before you travel
1. Open Lifolio **with a connection** and sign in.
2. Visit the pages you will need once: **Home**, your **Trips**, **Loyalty cards** and **Documents**. While you are online, Lifolio quietly refreshes the saved copies in the background, including the photos of your cards and documents.
3. Tip: add Lifolio to your home screen (see **Add to home screen**). It opens faster and works best offline that way.

> A page you have never opened online cannot open offline. If you see "nothing is saved on this phone yet", open that page once with a connection.

## How you know you are offline
Look at the small icon next to your name on Home:
- **Cloud:** you are online and everything is saved to the cloud as you go.
- **Phone:** you are offline. You are looking at what is saved on this phone.

Some screens also show a yellow note: "You are offline. Showing the copy saved on this phone."

## What works offline
- **See** your trips, loyalty cards (with the barcode) and documents.
- **Add** an expense or receipt, a flight or a document. It is saved on your phone first.
- **Change or delete** things you added.

## What needs a connection
- **Finding a flight** by number. Offline, enter the details yourself; they are saved and sent later.
- **Reading a receipt or document with AI.** Take the photo now and check the details yourself, or read it again when you are back online.
- **Add to calendar**, sharing with a partner, reports and exports.
- Seeing changes made by someone else, such as a trip a partner shared.

## Waiting to sync
Anything not sent yet is marked **Waiting to sync**. When your connection returns, Lifolio sends it by itself. You can also tap **Sync now** to send it right away. When it is sent, the mark disappears.

## Good to know
- Do not sign out while things are waiting to sync, and keep using the same phone and browser until they are sent.
- If a different person signs in on the same phone, the previous person's saved copies are removed.
- The saved copy can be a little old. The screen tells you when it was saved.$h$, 15)
on conflict (slug) do nothing;
