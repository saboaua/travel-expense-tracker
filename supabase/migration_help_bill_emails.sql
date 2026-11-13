-- Migration 67: Help topics for bill emails (Personal): the full setup guide and a "it does not arrive" checklist.
-- Run in the Supabase SQL Editor (safe to run more than once). Needs migration_help.sql first.
-- Added only the first time: after that, edit them in Admin > Help (a re-run never overwrites your edits).

insert into public.help_topics (slug, title, category, summary, body, sort_order) values
('bills-from-email', 'Get your bills from your email', 'Personal',
 'Your Gmail sends each "your bill is ready" email to Lifolio, and the bill appears in Utilities under Due, not paid yet, with a phone alert. Set up once, about 5 minutes.',
$h$Utility companies email you when a bill is ready. Lifolio can read those emails for you, so each bill is added to **Utilities** by itself and you get a phone alert. You never open the email to copy the amount.

## How it works
- A small script runs inside **your own Gmail** every 5 minutes. It looks for new mail from the companies you allow and sends each email to Lifolio.
- Lifolio reads the amount, the due date, the month and the account number, adds the bill to **Due, not paid yet**, and keeps the PDF if the email has one.
- Nothing counts in your totals or budget until you mark the bill **paid**. It counts in the month you paid it.
- It is free. You need a Gmail account and a computer or a phone browser for the first setup.

> The script only reads mail from the companies you allow. It never sends, changes or deletes any email.

## Before you start
1. Open **Personal**, then **Utilities**, then **Add bills from email**.
2. Turn on phone alerts if you want them (see **Turn on phone alerts**). The alert says the company, the month and the due date. It never shows the amount.

## Step 1: Allow your companies
Under **Allowed senders**, tap **Allow** next to each company you pay: **WEB Aruba**, **Elmar** or **Setar**. Mail from anyone else is ignored.

A company that is not in the list, or that emails you from another address, can be added with **Add a sender**: type its name and the exact email address it sends from. If a bill email arrives from an address you have not allowed, it shows under **Recent emails** as **Ignored**, with **Add as a sender** under it.

## Step 2: Say which accounts are yours
The same company may also bill other people, for example a parent. Under each sender, type **your account number** exactly as it is on the bill and tap **Add**. Bills for any other account are skipped, and are shown in **Recent emails** with **Add this account** in case you want them later.

- Leave a sender's account list empty to add every bill from that company.
- Dashes and spaces do not matter: 541324-1019191 is the same as 5413241019191.
- When a bill arrives and the list is still empty, tap **Only add account** under it to save that account in one tap.

## Step 3: Copy your script
Under **Set up, once**, tap **Copy script**. It already holds your private key, so there is nothing to type into it. Keep it private: whoever has it can add bills to your list.

## Step 4: Put the script in Google
1. Open **script.google.com** and sign in with the same Gmail where the bills arrive.
2. Tap **New project**.
3. Delete the sample code in the editor, paste your script, and tap **Save** (the disk icon).

## Step 5: Run it once and allow access
1. In the toolbar, open the box next to **Debug** and choose **sendBills**. Check that the box reads **sendBills**.
2. Tap **Run**.
3. Google asks for permission. Tap **Review permissions**, choose your Gmail account, tap **Advanced**, then **Go to (your project)**. Google warns that the app is not verified because it is your own script.
4. Tick **both** boxes, or **Select all**, then tap **Continue** or **Allow**. One lets the script find your bills in Gmail. The other lets it send them to Lifolio.

## Step 6: Make it repeat
1. In the left sidebar, tap the **clock icon** (Triggers).
2. Tap **Add Trigger**.
3. Choose function **sendBills**, deployment **Head**, event source **Time-driven**, type **Minutes timer**, every **5 minutes**.
4. Tap **Save**.

Do not use **Deploy**. This script runs in the background and needs no deployment.

## Step 7: Check that it works
Back in Lifolio, open **Add bills from email**. After the first bill email arrives, the status says **Connected** and the email shows under **Recent emails**. A new bill takes up to 5 minutes to appear.

The script looks at mail from the **last 3 days**. To add older bills once, change **newer_than:3d** to **newer_than:60d** in the script, tap **Save**, run **sendBills**, then change it back to **newer_than:3d** and save again.

## What you see
- **Utilities, Due, not paid yet:** the bill, tagged **From email**. If the email did not say which month the bill is for, the month is a good guess and is shown with **(check)**. If the email had no amount, it says **Amount missing**.
- **Paying a bill:** tap it. It opens as **Bill from email**. Check the amount, choose the day you paid, and save. Choose **Not paid yet** to keep it waiting.
- **A bill you do not want:** tap it, then tap **Delete this bill**.
- **The same email twice** is added once.

## Keep it safe
- Your key is only in your own script and your own account. Each person has their own.
- Lifolio trusts an email only when Gmail confirms it really came from the company, so a forged email does not become a bill.
- If your script is ever shared by mistake, open **Add bills from email** and tap **Make a new key**. The old script stops working. Copy the new script and paste it over the old one.
- To remove the access, go to myaccount.google.com/permissions and remove your script.

## If it does not work
See **Fix bill emails that do not arrive**.$h$, 27),
('bills-from-email-problems', 'Fix bill emails that do not arrive', 'Personal',
 'The status says Not connected yet, a bill is missing, or an email shows as Ignored or Skipped: what each one means and how to fix it.',
$h$Start on **Personal**, **Utilities**, **Add bills from email**. **Recent emails** shows every email Lifolio received and what it did with it.

## The status stays "Not connected yet"
Nothing has reached Lifolio yet. Check these in order:
1. **Allowed senders** has at least one company in it. With none, the script stops straight away.
2. A bill email from that company arrived in the **last 3 days**. To add older ones once, change **newer_than:3d** to **newer_than:60d** in the script, save, run **sendBills**, then change it back.
3. The company's email sits in your Gmail **inbox** and not in Spam or Trash.
4. The email comes to the **same Gmail** that your script runs under. The script cannot read another account.
5. In the script editor, the box next to **Debug** reads **sendBills** when you tap **Run**. Run always runs the name in that box. If it shows another name, only that function runs and you see just "Execution started" and "Execution completed".
6. The timer exists: tap the **clock icon** in the script editor and look for **sendBills**, every 5 minutes.

## The script says Forbidden, or nothing arrives after a new key
The key in the script is old. Open **Add bills from email**, tap **Copy script**, and paste it over everything in the script editor, then save.

## An email shows as "Ignored"
- **Not on your list of senders:** tap **Add as a sender** under it. Companies sometimes email from a different address than you expect.
- **Could not confirm this email really came from the sender:** Gmail could not verify it. Real company emails normally pass. An email you forwarded to yourself, or one that was changed on the way, does not. Do not test by forwarding a bill to yourself.

## An email shows as "Skipped, not one of your accounts"
The bill is for an account that is not on your list. It is probably someone else's. If it is yours, tap **Add this account**.

## A bill shows "Add by hand"
Lifolio could not find a bill in that email. Add it with **Add bill** in **Utilities**.

## The bill is there, but something looks wrong
- **The month has (check):** the email did not name a month, so Lifolio guessed. Open the bill and correct it.
- **Amount missing:** the email had no amount. Open the bill and type it.
- **A bill for another person is in the list:** tap it and tap **Delete this bill**, then add your own account number under the sender so it does not return.

## The alert did not come
Turn on phone alerts first (see **Turn on phone alerts**) and keep the **Payment reminders** choice on.

## Still stuck?
In the script editor, tap **Executions** in the left sidebar. Each run is listed with its name and result. A run that finished with an error shows the message. Share it with your administrator.$h$, 28)
on conflict (slug) do nothing;

-- The older Utilities guide says Lifolio cannot read bills. Fix only that sentence, and only when nobody has edited it.
update public.help_topics
set body = replace(body, 'Lifolio is not connected to your utility companies, so it cannot read your bills. You add each bill yourself: it takes a minute, and then you can always trace back what you paid and when.',
                         'You can add each bill yourself, which takes a minute, or let Lifolio read the "your bill is ready" emails from your companies (see **Get your bills from your email**). Either way you can always trace back what you paid and when.')
where slug = 'utility-bills'
  and body like '%Lifolio is not connected to your utility companies, so it cannot read your bills.%';
