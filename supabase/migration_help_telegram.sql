-- Help topic: how to connect Telegram. Run in the Supabase SQL Editor (safe to run more than once).
-- Needs migration_help.sql first. Added only the first time: after that, edit it in Admin > Help (a re-run never overwrites your edits).

insert into public.help_topics (slug, title, category, summary, body, sort_order) values
('connect-telegram', 'Connect Telegram', 'Telegram',
 'Send receipts and documents from your phone, and get trip reminders and summaries in Telegram.',
$h$Once Telegram is connected you can photograph a receipt or document in a chat and it is filed for you. You also get trip reminders and a weekly summary. It takes about a minute.

## What you need
- The **Telegram** app on your phone (free), signed in.
- This app, signed in on any device.
- Telegram turned on by an administrator. If you do not see a Telegram section in your Profile, ask them.

## Connect your account
1. Open **Profile** and find the **Telegram** section.
2. Tap **Enable Telegram**. A link appears.
3. Tap **Open chatbot**. Telegram opens with the assistant.
4. Tap **Start** at the bottom of the chat. The assistant replies that your account is linked.
5. Back in the app, the section now says **Connected**.

> Tip: the link works once and expires after 15 minutes. If it has expired, tap **Enable Telegram** again for a new one. On a computer, tap **Copy link** and open it on your phone.

## File a receipt or document
1. Open the assistant chat in Telegram.
2. Send a **photo** or a **PDF**.
3. Add a word to the caption to choose where it goes, for example **groceries** or **passport**. With no word it goes to your default trip (choose it with **/trips**).
4. The assistant confirms what it saved. It also appears in the app.

## Useful commands
- **/trips**: choose your default trip.
- **/recent**: your last expenses.
- **/summary**: your trips and spending.
- **/notify**: choose which messages you get, and quiet hours.
- **/help**: the list of commands.

## Messages you can choose
In **Profile > Telegram**, once connected, you can switch messages on or off and set quiet hours. Trip reminders and your weekly summary share one switch.

## Disconnect
In **Profile > Telegram** tap **Disconnect**. The assistant stops answering for your account and you can connect again at any time.

## If it does not work
- **Nothing happens after Start:** the link may have expired. Create a new one and tap Start again.
- **"That code expired":** tap **Enable Telegram** in the app for a new link.
- **The assistant does not reply to a photo:** check the section says **Connected**. If it does not, connect again.

> Only connect your own Telegram account. Anyone using your linked chat can add expenses to your account.$h$, 30)
on conflict (slug) do nothing;
