-- Help topics for the latest features, plus admin guides. Run in the Supabase SQL Editor (safe to run more than once). Needs migration_help.sql first.
-- Topics are added only the first time: after that, edit them in Admin > Help (a re-run never overwrites your edits).
-- Topics in the "Admin" group are saved as DRAFTS: only admins and people who can manage Help see them, other users never do.
--
-- Added: welcome tour, sign in and request an account, forgot password, temporary password, contact support, scan a receipt,
-- groceries overview, price tracker, add a price, community prices, loyalty cards, home projects, personal trips, reports,
-- sharing activity, waiting to sync, privacy, and eight Admin guides.

insert into public.help_topics (slug, title, category, summary, body, sort_order, published) values
('welcome-to-lifolio', 'Welcome to Lifolio: what you can do here', 'Getting started',
 'A quick tour of everything in the app: business trips, groceries and prices, bills, budget, savings, documents and cards.',
$h$Lifolio keeps your travel and your household in one place. Everything you add stays private to you unless you choose to share it.

## The main parts
- **Trips:** plan a business trip, add flights and receipts, and send a report.
- **Personal:** groceries and prices, home projects, personal trips, utility bills, subscriptions, loyalty cards, a monthly budget and savings plans.
- **Documents:** passports, licences and cards you want at hand.
- **Reports:** what your business trips cost, by month and by category.
- **Profile:** your details, home place, password, alerts and your data.

## Start here
1. **Scan a receipt.** Tap **Scan receipt** and photograph it. Lifolio reads the store, items and total for you.
2. **Add a trip** if you travel for work, or open **Personal** to keep track of home spending.
3. **Turn on alerts** and **add the app to your home screen** so it opens like any other app.

## Good to know
- Lifolio works offline. What you add waits and is sent when you are back online.
- Use **Help** (this section) any time. Type a few words in the search box.
> Stuck? Use **Contact Support** at the bottom of the sign-in screen, or in the menu.$h$, 1, true),

('sign-in-and-request-an-account', 'Sign in, or request an account', 'Getting started',
 'How to sign in, what to do if you do not have an account yet, and what happens after you request one.',
$h$## Sign in
1. Open the app and type your **Email** and **Password**.
2. Tap **Sign In**. Tap the eye to see what you typed.
3. **Remember me** keeps you signed in on this device. Do not use it on a shared computer.

## You do not have an account yet
1. On the sign-in screen tap **Request one** (under the form).
2. Type your **Full name**, then an **Email**, a **Phone number**, or both. One of them is needed so we can reach you.
3. Tap **Request account**. You see **Request sent**.

An administrator reads every request and contacts you, then creates your account and gives you a temporary password.

## First sign-in
You are asked to choose a new password. See **Your temporary password** in this Help.

## If it does not work
- **That email or password is not right:** check both, then try again. After several wrong tries you are asked to wait a few minutes.
- **Forgot your password:** see **Forgot your password**.
- **Request not sent:** check your connection. You can send up to 5 requests an hour from one device.$h$, 2, true),

('forgot-your-password', 'Forgot your password', 'Your account',
 'Reset your password from the sign-in screen with a link sent to your email.',
$h$1. On the sign-in screen tap **Forgot password?**.
2. Type your email and send it.
3. Open the email and tap the link. It works once and expires after a while.
4. Choose a new password and save it.

## If the email does not arrive
- Check your spam or junk folder.
- Check you typed the email you were given.
- Ask your administrator to create a new temporary password for you.

> To change a password you remember, open **Profile**, then **Password**.$h$, 10, true),

('temporary-password', 'Your temporary password', 'Your account',
 'What to do the first time you sign in with a password an administrator gave you.',
$h$When an administrator creates your account you receive three things: the **link** to the app, your **email** and a **temporary password**.

## First sign-in
1. Open the link and sign in with the email and temporary password.
2. You are asked to choose your own password. Pick one only you know.
3. Save it. You are taken into the app.

## Good to know
- A temporary password **expires**. If it has, you see a message. Ask your administrator for a new one.
- Never share your own password with anyone, including the administrator.$h$, 11, true),

('contact-support', 'Contact support', 'Getting started',
 'Send a message to the people who run Lifolio when something is wrong or you have a question.',
$h$1. Tap **Contact Support** at the bottom of the sign-in screen.
2. Type your name, email, a short subject and your message.
3. Tap send. The administrators are told and answer you by email.

## Get a faster answer
- Say what you were doing and what you expected to happen.
- Say which device you use (phone or computer) and what you saw on the screen.
- You can send up to 5 messages an hour.$h$, 12, true),

('scan-a-receipt', 'Scan a receipt', 'Getting started',
 'Photograph or upload a receipt and let Lifolio read it for you, then check and save.',
$h$## Scan
1. Tap **Scan receipt** (on Groceries, a trip, or a project).
2. Take a photo of the receipt, flat and well lit, or choose a picture you already have with **Upload**.
3. Crop to the receipt if asked.
4. Check what was read: store, date, items and total. Fix anything that is wrong.
5. Tap **Save**.

## Where it goes
Lifolio suggests business or personal using your **home place**. A grocery receipt at home goes to **Groceries**. A receipt from somewhere else is suggested for a **trip**. You can change it before saving.

## Tips
- Keep all four edges of the receipt in the picture.
- A long receipt: take it in one photo if you can, or flatten it.
- Offline? Your receipt waits and is sent when you are back online.$h$, 3, true),

('groceries-overview', 'Groceries: your shopping, prices and savings', 'Personal',
 'The Groceries page: scan a receipt, track prices, find the best store and see what you spend.',
$h$Open **Personal**, then **Groceries**.

## At the top
- **Scan receipt:** the big button. Photograph a grocery receipt.
- **Price tracker:** every item you bought with its price at each store.
- **Best store:** a map and a list showing where your shopping list costs least.
- **Add a price:** write down a price you saw in a shop without buying.

## Below
- Your spending this month and which stores you use most.
- Your latest receipts. Tap one to see every line, edit it or delete it.

## Related
- **Community prices** (in Profile) lets you share prices, and see prices others shared.
- **Keep prices without spending** explains Add a price.$h$, 20, true),

('price-tracker', 'Price tracker: compare prices across stores', 'Personal',
 'See how the price of each product changes over time and which store is cheapest.',
$h$Open **Groceries**, then **Price tracker**.

## What you see
- Each product you bought, with the **latest price** and the **cheapest store**.
- **Price over time:** a small chart. Buy it again and the history grows.
- **Sort** by Most recent, Most purchased, Biggest saving, Biggest price increase or Cheapest.
- **Search items** to jump to one product.

## Same product, different names
Stores print names differently. When Lifolio is not sure, it asks **Same product?** Tap **Yes, same** to combine them, or **No, keep apart**.

## Online prices
Some products show **Online prices today** with **Open in shop** to check. A line such as **Possible match online, open to check** means it may not be exactly the same product. **Not found online yet** means no match.

## Good to know
- Prices need a store name and a date. Add a price by hand with **Add a price**.
- **Only seen at one store** means there is nothing to compare yet.$h$, 21, true),

('add-a-price', 'Add a price you saw in a shop', 'Personal',
 'Record a shelf price without buying, with an optional photo of the tag, so you can compare it later.',
$h$1. Open **Groceries**, then **Add a price**.
2. Type the **Product**, for example *C4 Energy*, and the size, for example *30 servings*.
3. Choose the **Store** and type the price.
4. Pick the **Date** (Yesterday and Today are quick buttons) and the **Currency**.
5. Optionally add a **Photo of the shelf tag** and a note such as *Promo until Sunday*.
6. Tap **Save**, or **Save and add another store** to record the same product at more stores.

The price then shows in the **Price tracker** next to your receipts, and in **Best store**.$h$, 22, true),

('community-prices', 'Community prices: share prices, see better deals', 'Personal',
 'Opt in to share only the store, item name and price from your receipts, and see where others found the same item cheaper.',
$h$**Community prices** lets people help each other find cheaper groceries. If one person bought an item cheaper somewhere else, you can see it.

## What is shared
- **Only** the store name, the item name and the price (and the pack size and currency, so like is compared with like).
- **Never:** your name, email, receipts, dates, location, totals or what else was in your basket.

## Turn it on or off
1. Open **Profile**, then **Community prices**.
2. Switch **Share my prices** on. It is **off** until you turn it on.
3. Your prices are sent the next time you open the **Price tracker**.
4. Switch it off any time. Nothing more is shared.

## Delete what you shared
In **Profile**, **Community prices**, tap **Delete what I shared**. Your shared prices are removed. They are also removed if you delete your account.

## See community prices
Open **Groceries**, **Price tracker**, **Community prices**. Search for a product. A price shows only after **3 or more different people** reported it, and you see the middle price, not a person.

> Nobody can tell who shared a price. The list holds no account information.$h$, 23, true),

('loyalty-cards', 'Keep your loyalty cards on your phone', 'Personal',
 'Save store cards and their barcodes so you can show them at the till, and share a card with someone you trust.',
$h$Open **Personal**, then **Loyalty cards**.

## Add a card
1. Tap **Add card**.
2. Type the **Store name**.
3. Type the **Barcode or card number**. The **Barcode format** is detected for you. Change it if the barcode does not scan.
4. Optionally add the **Card holder** and the **Card type** (for example Supermarket or Pharmacy).
5. Pick a **Card colour**, swipe for more. The **Preview** shows how it looks.
6. Tap **Save**.

## Use it at the shop
Open the card and hold the screen towards the scanner. Turn the brightness up if it does not read.

## Share a card
Open the card and tap **Share** to let someone you trust show it too. See **Share with a partner**.

## Good to know
- Cards also work offline once they have been opened once.$h$, 24, true),

('home-projects', 'Home projects: what a repair or renovation costs', 'Personal',
 'Group tickets and receipts by project, such as a kitchen or a roof, and see the total.',
$h$Open **Personal**, then **Home projects**.

## Add a project
1. Tap **New project** and give it a name.
2. Optionally add a budget and notes.
3. Tap **Save**.

## Add the spending
1. Open the project and tap **Add expense**, or **Scan receipt** to read a ticket.
2. Check the amount, store and date, then **Save**.

## See the cost
The project shows the total so far and every expense. Tap an expense to change it or delete it.

> For small house costs with no project, use **Quick spend** and tag the **house area**. See **Tag house spending by area**.$h$, 25, true),

('personal-trips', 'Personal trips: what a holiday cost', 'Personal',
 'Track spending on a personal trip, separate from business trips, by scanning receipts.',
$h$Open **Personal**, then **Travel**.

1. Tap **New trip** and type the destination and dates.
2. Open the trip and tap **Add expense** or **Scan receipt**.
3. Check the amount, category and currency, then **Save**.
4. The trip shows the total and each expense. Tap one to change it.

## Good to know
- Personal trips are **not** part of your business **Reports**.
- Foreign currency is converted using the rate for the day, so you can compare.$h$, 26, true),

('reports', 'Reports: business travel spending', 'Business trips',
 'See what your business trips cost, by month and by category, in US dollars.',
$h$Open **Reports** from the menu.

## What you see
- **Monthly spending** for the year you choose. The current month is highlighted.
- **Spending by category**, as a share of the year.
- A list of your trips with each total.

## How amounts are counted
Everything is shown in **US dollars**, using the exchange rate saved with each expense.

## Good to know
- Only **business trips** are counted here. Personal spending is under **Personal**.
- Change the year at the top to look back.
- For one trip, open it and tap **Report** to export it. See **Export a trip report**.$h$, 40, true),

('sharing-activity', 'See who you shared with', 'Sharing',
 'A history of what you shared, who accepted and when, and how to stop sharing.',
$h$Open **Profile**, then **Sharing**, then **Sharing activity**.

## What you see
- Who you invited and what you shared (a trip or a card).
- Whether they accepted, and when.
- When sharing stopped.

## Stop sharing
Open the trip or card and remove the person. They lose access at once.

> Sharing never gives anyone your password or your other data.$h$, 41, true),

('waiting-to-sync', 'Waiting to sync: items saved offline', 'Getting started',
 'What the Waiting to sync list means, and how to send items that are still on your phone.',
$h$When you are offline, Lifolio saves what you add on your phone and sends it later.

## The list
Open **Waiting to sync** (shown as a small notice when something is waiting). Each line is something not yet sent: a receipt, an expense or a card.

## Send them
1. Check your connection.
2. Open the app. Items are sent by themselves.
3. Or tap **Sync now** on the item. If it says it failed, tap **Try again**.

## Good to know
- Do not clear your browser data while items are waiting. They would be lost.
- Photos are sent after the entry, so they can arrive a little later.$h$, 13, true),

('privacy-and-your-data', 'Your privacy: what Lifolio keeps', 'Your account',
 'What is stored about you, who can see it, what Community prices shares, and how to download or delete it.',
$h$## What is stored
Your trips, receipts, bills, documents and cards, so you can use them. Only you see them, unless you share a trip or a card.

## What others can see
- **Administrators** can manage accounts and settings. They do not browse your receipts.
- **People you share with** see only the trip or card you shared.
- **Community prices** (only if you turn it on) shares the store name, item name and price. Never your name, email, receipts, dates or location.

## Your controls
- **Download everything:** **Profile**, **Your data**.
- **Delete your account** and all your data: **Profile**, **Your data**. It is removed after a short waiting period you can cancel.
- **Stop sharing prices** and delete what you shared: **Profile**, **Community prices**.
- **Your location:** used only when you ask, for Best store and the home place. The home point is rounded to about 100 m and only you can see it.

Read the full **Privacy Policy** from the bottom of the sign-in screen.$h$, 12, true),

('admin-create-users', 'Admin: create a user and send the sign-in details', 'Admin',
 'Create an account, copy the link and temporary password, and send them to the person.',
$h$Open **Settings**, then **User Roles & Users**.

1. Type the person's **Email**, **First name** and **Last name**.
2. Choose a **Role**. Users see everything for themselves, assistants help with Help and support, admins manage everything.
3. Tap **Create user**.
4. A box shows the **link**, **user** and **temp password**. Tap **Copy** and send it to them.

## Good to know
- The password expires. If it does, create a new one for the person.
- If a person asked for an account on the sign-in screen, use **Account Requests** first. **Create account** opens this page with their name and email filled in.$h$, 100, false),

('admin-account-requests', 'Admin: handle account requests', 'Admin',
 'See who asked for an account on the sign-in screen and how to reach them.',
$h$Open **Settings**, then **Account Requests**.

- Each request shows the name, the email or phone number, and when it was sent. **New** ones are waiting.
- Tap **Create account** to open the create-user page with their name and email filled in. The request is marked **Handled**.
- Tap **Dismiss** for requests you do not want. Use **Move back to New** to undo.
- If they gave only a phone number, contact them and ask for an email before you create the account.

Needs **migration_account_requests.sql** to have been run.$h$, 101, false),

('admin-supermarket-places', 'Admin: load supermarket places for the Best store map', 'Admin',
 'Import shops with their GPS points from Excel so they show on the Best store map.',
$h$Open **Settings**, then **Supermarket Places**.

1. Tap **Download the example file** and fill it in: **Name**, **Latitude**, **Longitude**, and an optional **Address**, one row per shop.
2. Use the shop name as printed on receipts, so receipts match the right place.
3. Choose the file. A preview shows how many rows are kept and how many are skipped, and why.
4. Tap **Import**. It **replaces** the whole saved list, so keep every shop in the file.

## Where to get the numbers
On openstreetmap.org right-click the shop, or read your phone's GPS at the shop. Do **not** copy coordinates from Google Maps. Its terms do not allow keeping them.$h$, 102, false),

('admin-doit-prices', 'Admin: import the Do it price list', 'Admin',
 'Load the Do it price list from an exported Excel file for the Price tracker.',
$h$Open **Settings**, then **Do it Aruba Prices**.

1. Export the price list from your own Do it account as an Excel file.
2. Choose the file on this page and check the preview.
3. Tap **Import**.

The prices then show next to your own in the **Price tracker**. Run it again to refresh them. Never share the Do it login with the app.$h$, 103, false),

('admin-branding-and-privacy-policy', 'Admin: branding and the privacy policy', 'Admin',
 'Change the app name, logo and colour, and write the privacy policy, including the line about shared prices.',
$h$Open **Settings**, then **Branding**.

- **App name, logo and logo size, primary colour:** shown on the sign-in screen and across the app. The button colour on the sign-in screen is the primary colour.
- **Support email:** where support messages are announced.
- **Privacy policy:** the text people read from the sign-in screen.

## Add a line about Community prices
If people can turn on Community prices, add something like: *If you turn on Community prices, the store name, item name and price from your receipts are shared without your name or account, and you can turn it off and delete them at any time.*$h$, 104, false),

('admin-setup-check', 'Admin: check that everything is set up', 'Admin',
 'Run the setup check in Supabase to see which migrations are missing.',
$h$1. Open the **Supabase SQL Editor**.
2. Paste **supabase/check_setup.sql** and run it. It only reads, it changes nothing.
3. The first row says **ALL GOOD**, or how many things to fix. Each line to fix names the migration to run.
4. Run that migration (select the whole file, then run once), then run the check again.

## Good to know
- If a migration stops on an error, nothing from it is saved. Send the exact error message to whoever maintains the app.
- After adding columns or functions, run **notify pgrst, 'reload schema';** so the app sees them straight away.$h$, 105, false),

('admin-write-help', 'Admin: write and edit Help topics', 'Admin',
 'Add, change and hide Help topics, and the simple marks you can use.',
$h$Open **Settings**, then **Help**.

## Add or edit
Tap **New topic**, or tap a topic to change it. Fill in the title, group, summary and text, then save. Untick **Published** to keep it as a draft only people who manage Help can see.

## Marks in the text
- **## Heading** for a sub heading
- **1. Step** for numbered steps
- **- Point** for bullet points
- **> Tip** for a highlighted tip
- **\*\*bold\*\*** for bold text

Plain text only: pictures and links are not used.$h$, 106, false)
on conflict (slug) do nothing;

-- The Home place topic gets the GPS point section (only if it is not there yet)
update public.help_topics
set body = body || E'\n\n## Save a GPS point for Best store\nThe **Home place** section also has a **Home GPS point**. Stand at home and tap **Save my home location**. Best store then measures distance from home when your phone location is off. The point is rounded to about 100 m and only you can see it. Tap **Remove** to delete it.'
where slug = 'set-home-place' and body not like '%Home GPS point%' and char_length(body) < 7400;

notify pgrst, 'reload schema';
