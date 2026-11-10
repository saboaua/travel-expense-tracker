-- Migration 43: Help topic "Switch to dark mode".
-- Run in the Supabase SQL Editor (safe to run more than once). Needs migration_help.sql first.
-- Added only the first time: after that, edit it in Admin > Help (a re-run never overwrites your edits).

insert into public.help_topics (slug, title, category, summary, body, sort_order) values
('switch-to-dark-mode', 'Switch to dark mode', 'Getting started',
 'Use a dark screen that is easier on the eyes at night, and switch back whenever you like.',
$h$Dark mode gives the app a dark background with light text. It is easier on your eyes in the evening and can save battery on some phones.

## Switch on a phone
1. Tap **Menu** at the right end of the bottom bar to open the full menu.
2. Near the bottom, above **Sign out**, tap **Dark mode**.
3. The whole app turns dark at once. The button now reads **Light mode**.

## Switch on a computer or tablet
1. Look at the menu on the left side of the screen.
2. Near the bottom, above **Sign out**, click **Dark mode**.
3. Click **Light mode** in the same place to go back.

## Good to know
- **The first time,** the app follows your device. If your phone or computer is already set to dark, the app starts dark too.
- **Your choice is remembered** on that device. If you use the app on a phone and a computer, switch each one the way you like.
- The top bar of the phone (the status bar) changes colour to match.
- Everything is readable in both modes, including receipts, charts and documents.$h$, 6)
on conflict (slug) do nothing;
