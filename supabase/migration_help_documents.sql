-- Migration 41: Help topic "Add your documents" (Personal page, Documents).
-- Run in the Supabase SQL Editor (safe to run more than once). Needs migration_help.sql first.
-- Added only the first time: after that, edit it in Admin > Help (a re-run never overwrites your edits).

insert into public.help_topics (slug, title, category, summary, body, sort_order) values
('add-your-documents', 'Add your documents', 'Personal',
 'Keep your passport, ID, driver''s license and more in one private place, and choose whether each one shows on your Personal or Business dashboard.',
$h$Documents keeps your passport, visa, ID card, driver's license, insurance and other papers in one private place. Only you can open them. The app also reminds you before one expires.

## Add a document
1. Open **Personal**, then **Documents**. (You can also tap **Documents** on the Personal or Business dashboard.)
2. Tap **Add document**.
3. To fill in the details for you, tap **Scan with camera** and take a photo of the document, or choose a photo or PDF. Crop it if you like.
4. Check the **Type** (Passport, Visa / e-visa, ID card, Driver's license and so on), the **Name**, the **Document number** and the **Expiry date**. A passport needs an expiry date so you can be reminded to renew it.
5. Under **Show on**, choose where it appears (see below).
6. Tap **Save document**.

> No signal? You can still add a document. It waits on your phone and is saved when you are back online.

## Choose where it shows
**Show on** decides which dashboard lists the document:
- **Personal:** only on your Personal dashboard.
- **Business:** only on your Business dashboard.
- **Both:** on both. This is the default.

The document is never copied, so a change you make shows everywhere it is listed. You can change **Show on** at any time: open the document, tap **Edit** and pick another choice.

## What you see on the dashboard
Each document is a card with its type, country, a number that is partly hidden, and the expiry date. A badge shows **Valid**, **Expires soon** or **Expired**, and the card counts down the days when the end is near. Tap the eye to **view** the file or the arrow to **download** it. The soonest to expire is shown first. **View all** opens the full list.

## Keep it safe
- The number is hidden by default. In **Documents**, tap the eye next to it to show it.
- Files are stored privately. When AI reading is on, the photo you scan is sent to the AI service to read it.

## Change or remove a document
In **Documents**, tap the three dots on a document to **Edit** or **Delete** it.$h$, 36)
on conflict (slug) do nothing;
