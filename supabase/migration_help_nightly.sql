-- Help for the nightly community share. Run in the Supabase SQL Editor (safe to run more than once). Needs migration_help.sql first.
-- It ADDS a section to the Community prices topic (only while it does not mention the nightly share). Nothing is replaced.

update public.help_topics set
  body = body || E'\n\n## When your prices are shared\nPrices are shared **once a night**, not the moment you save a receipt. That gives you time to fix a wrong price first.\n- Fix a receipt before tonight and the corrected price is the one shared.\n- Change or delete a receipt later and the shared list is corrected the next night.\n- Tap **Share my latest prices now** in **Profile**, **Community prices** if you do not want to wait.\n- Only the store, item name, size and price are written. Never your name, email, receipts, dates or totals.'
where slug = 'community-prices' and body not like '%once a night%';

notify pgrst, 'reload schema';
