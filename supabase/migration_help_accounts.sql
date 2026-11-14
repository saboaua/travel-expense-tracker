-- Help for: no guessed prices in Best Prices, changing your sign-in email, and what happens to shared prices when an account is deleted.
-- Run in the Supabase SQL Editor (safe to run more than once). Needs migration_help.sql first.
-- Older topics only get ADDED text (or one sentence replaced while it still has the old wording), so an edited topic is never overwritten.

insert into public.help_topics (slug, title, category, summary, body, sort_order, published) values
('change-email', 'Change the email you sign in with', 'Profile',
 'Type a new email, tap the link we send to it, and you sign in with the new address.',
$h$You can change the email you sign in with yourself.

## Change it
1. Open **Profile**, then **Sign-in email**.
2. Type your **New email** and tap **Change email**.
3. Open the message we send to the **new** address and tap the link. It works for 24 hours.

Until you tap the link you still sign in with your old email. If the message does not arrive, tap **Send it again** in **Sign-in email**.

## If it does not work
- **"That email is already used":** someone has an account with that address. Try another one, or ask an admin.
- **"Too many tries":** wait a few minutes and try again.
- **The link says it did not work:** it was used already or it expired. Open **Profile** and tap **Send it again**.$h$,
 63, true)
on conflict (slug) do nothing;

-- Best Prices never guesses
update public.help_topics set
  body = body || E'\n\n## No guessed prices\nBest Prices shows only real prices: what you paid, community prices (3 or more people) and online price lists. An item with no price at a store is left out of that store and shown as **not counted**. Stores that price more of your list come first.'
where slug = 'best-store' and body not like '%No guessed prices%';

-- Shared prices when an account is deleted
update public.help_topics set
  body = replace(body, 'They are also removed if you delete your account.', 'If you delete your account, the prices you shared stay in the community list. They hold only the store, item and price, and nothing links them to you. Tap **Delete what I shared** first if you want them removed.')
where slug = 'community-prices' and body like '%They are also removed if you delete your account.%';

-- Sharing is now once a night
update public.help_topics set
  body = replace(body, 'Your prices are sent the next time you open the **Price tracker**.', 'Your prices are shared once a night. Tap **Share my latest prices now** if you do not want to wait.')
where slug = 'community-prices' and body like '%Your prices are sent the next time you open the **Price tracker**.%';

notify pgrst, 'reload schema';
