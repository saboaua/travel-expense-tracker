-- Help for Community badges. Run in the Supabase SQL Editor (safe to run more than once). Needs migration_help.sql first.
-- The topic is added only the first time; the Phone alerts topic is updated only while it does not mention badges yet.

insert into public.help_topics (slug, title, category, summary, body, sort_order, published) values
('community-badges', 'Community badges: earn a level for sharing prices', 'Profile',
 'Share prices with Community prices and earn a badge. Five levels, shown only to you.',
$h$When you turn on **Community prices**, you earn a **badge** for the prices you share. Only you can see it. There is no leaderboard.

## The levels
- **Helper:** your first shared price
- **Scout:** 150 prices
- **Guardian:** 750 prices
- **Champion:** 2,500 prices
- **Legend:** 4,000 prices

## Where to see it
- Your badge shows next to your name in **Profile**.
- Open **Profile**, **Community prices** to see your progress to the next level.
- Tap **See all badges** for every level and what unlocks it.

## How it counts
- One price per product and store. Sending a newer price for the same item does not count again.
- The count stays when old prices expire.
- **Delete what I shared** restarts your count at 0. Badges you already earned stay.

## Phone alert
Turn on **Community badges** in **Notifications** to get one alert each time you reach a new level.$h$,
 62, true)
on conflict (slug) do nothing;

update public.help_topics set
  body = replace(body,
    E'- **Gambling limit:**',
    E'- **Community badges:** one alert when you reach a new level for sharing prices.\n- **Gambling limit:**')
where slug = 'turn-on-notifications' and body like '%Gambling limit:%' and body not like '%Community badges:%';

notify pgrst, 'reload schema';
