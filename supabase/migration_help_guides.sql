-- Help topics: create a trip, add a receipt to a trip, import a grocery receipt, export a trip report.
-- Run in the Supabase SQL Editor (safe to run more than once). Needs migration_help.sql first.
-- Each topic is added only the first time: after that, edit it in Admin > Help (a re-run never overwrites your edits).

insert into public.help_topics (slug, title, category, summary, body, sort_order) values

('create-a-trip', 'Create a trip', 'Business trips',
 'Set up a business trip once, then keep every receipt for it in one place.',
$h$A trip holds the receipts for one journey. Create it before you leave, or at any time afterwards.

## Create the trip
1. On the **Dashboard**, tap **New Trip**. You can also open **Business > Trips** and add one there.
2. Type the **Trip name**, for example Winlott Meeting 2026. It is the only name you will see in lists and reports.
3. Add the **Destination**, for example Panama City, Panama. A photo of the place is shown on the Dashboard.
4. Choose the **Start date**. Add the **End date** if you know it.
5. Pick the **Travel category** and the **Default currency** the trip is paid in.
6. Optional: add **Notes**, and attach documents such as a ticket or booking.
7. Tap **Create trip**.

> Tip: the destination also gives you the travel advice and weather for that place on the Dashboard.

## Change or finish a trip
1. Open the trip and tap **Edit**.
2. Change anything, then tap **Save changes**.
3. When the trip is over and every receipt is in, mark it **complete**. It moves from Active Trips on the Dashboard to the full list under Trips.

> A trip that has ended stays active until you mark it complete, so late receipts can still be added.

## Delete a trip
Open the trip, tap **Edit** and use **Delete trip** in the danger zone. This also deletes all of its expenses and receipt photos, and it cannot be undone.$h$, 40),

('add-a-trip-receipt', 'Add a receipt to a trip', 'Business trips',
 'Photograph a receipt, check what was read, and save it to the trip.',
$h$Every expense on a trip starts with its receipt. The app reads the merchant, amount and date for you, and you check them before saving.

## Scan or upload from the Dashboard
1. On the **Dashboard**, tap **Scan** to use the camera, or **Upload** to pick a photo from your phone.
2. If you have one active trip, its form opens straight away. If you have several, choose the trip. The form has a **Change** button if the receipt is for another trip.
3. Wait for **Reading receipt**. The merchant, amount, currency and date are filled in.

## Add it from the trip itself
1. Open the trip.
2. Tap **Add expense**.
3. Tap **Take Photo** or **Upload** under Receipt Photo.

## Check and save
1. Check the **Merchant**, **Amount**, **Currency** and **Date**. Correct anything the app got wrong.
2. If the currency is not your trip currency, the **Rate to USD** is filled in with today's rate. Change it if your card statement shows a different one.
3. Choose the **Category**, and add **Notes** if you want.
4. Tap **Save Expense**.

> Tip: if the app thinks you saved the same receipt before, it asks first. Tap **Save anyway** only if it really is a second purchase.

## No connection?
The expense is kept on your phone and uploaded by itself when you are online again. It waits in the pill at the top of the screen.

## A receipt as a PDF
Receipts from email can be uploaded as a photo of the screen. A PDF is accepted only as a document, not as an expense.

## Fix a mistake
Open the trip, tap the expense, change it and save. You can also read the receipt again from the expense if it has a photo.$h$, 50),

('import-grocery-receipt', 'Import a grocery receipt', 'Personal',
 'Scan a supermarket receipt and keep every item, so you can watch prices over time.',
$h$Grocery receipts are kept item by item. Over time the app shows how the price of the things you buy changes.

## Scan the receipt
1. Open **Personal** and then **Groceries**.
2. Tap **Scan receipt** (or **Scan your first receipt** the first time).
3. Take a photo of the whole receipt, flat and in good light. You can also choose a photo from your gallery.
4. Wait while the app reads it. The **Store**, **Date**, **Currency** and **Receipt total** are filled in, with one line for each item.

> Tip: from the Dashboard you can also tap **Scan** or **Upload** and choose **Groceries**.

## Check the items
1. Compare the **Items** with your paper receipt. Fix a name, **Qty**, **Price each** or **Line total** that was read wrongly.
2. Tap **Add item** for a line that is missing, or the bin icon to remove a wrong one.
3. Look at the line under the list: **Items add up to** should match the **Receipt total**. If it does not, an item is missing or wrong.
4. Items sold by weight show the weight and the price per kilo, so prices stay comparable.

## Save
Tap **Save receipt**. It appears in the Groceries list, and its items feed the price tracker.

## Watch prices
In **Groceries**, tap **Price tracker** to see how an item's price changes between shops and dates.

## Fix or delete a receipt
Open the receipt in the Groceries list, then edit it or delete it.

> A PDF cannot be read as a grocery receipt yet. Use a photo.$h$, 60),

('export-trip-report', 'Export a trip report', 'Business trips',
 'Download a trip as an Excel file, or as a ZIP with all the receipt photos, for your expense claim.',
$h$When the trip is done, you can download everything you spent in one file to send to your finance team.

## Export
1. Open **Business > Trips** and tap the trip.
2. Check the summary: the total, the spending by category and the list of expenses.
3. Tap **Export** and choose a format (see below).
4. The file downloads to your phone or computer. On a phone, look in your Downloads or Files app.

## The two formats
- **Excel**: a spreadsheet of every expense, with merchant, date, category, amount, currency, rate and the total in USD.
- **ZIP**: the same Excel file plus all the receipt photos in a **receipts** folder.

## Before you export
- Make sure every receipt is added. Late ones can be added until you mark the trip complete.
- Check the amounts and dates of the expenses you are not sure about. The report shows exactly what is saved.
- Choose **ZIP** if your company needs the receipt photos as proof.

> Tip: a ZIP can be large when there are many photos. If it is slow on mobile data, use Wi-Fi.

## Reports for several trips
Open **Reports** for spending across all trips by month, year and category.$h$, 70)

on conflict (slug) do nothing;
