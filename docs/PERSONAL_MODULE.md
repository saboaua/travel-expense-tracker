# Personal section: best practices and execution plan

Goal: let each user track **personal** money inside the same app: groceries (with price tracking),
home projects (with a budget) and personal trips, by scanning receipts.

## 1. Principles

1. **Private by default.** Personal data never mixes with business trips, reports, exports or Telegram.
   Separate tables, row level security `user_id = auth.uid()` on every operation, and *no admin policy*,
   so admins and assistants cannot read it through the app.
2. **Reuse, don't fork.** Same receipt pipeline (compress -> AI read -> on-device OCR fallback), same
   currency/rate helpers, same UI kit. One shared "project" model serves home projects and personal trips.
3. **Never trust a scan.** Every scan lands on a review screen first. Nothing is saved until the user confirms.
   Grocery items are editable rows (name, qty, price, category) with a visible receipt total check.
4. **Store facts, compute insights.** Save raw rows (receipt, item, expense). Price changes, monthly totals
   and category summaries are derived in pure, unit-tested functions, so formulas can improve without migrations.
5. **Honest numbers.** A price comparison only compares like with like: same normalised item name, same
   currency. Percent change is shown against the previous purchase and against the average.
6. **Small, fast, mobile first.** Compress photos before upload (long grocery receipts keep a larger size),
   paginate lists, one query per screen where possible.
7. **Fail safe.** No AI key -> basic OCR; OCR finds nothing -> manual entry form. Never block saving.
8. **Admin switch.** `app_settings.personal_enabled` lets an organisation hide the section entirely.

## 2. Data model

| Table | Purpose | Key columns |
|---|---|---|
| `personal_projects` | home project **or** personal trip (`kind`) | name, destination, dates, budget, currency, status |
| `personal_expenses` | a scanned/entered expense inside a project | amount, currency, exchange_rate, amount_usd, category, receipt_path |
| `grocery_receipts` | one shopping trip | store, purchase_date, total, currency, receipt_path |
| `grocery_items` | one line of a receipt | name, **normalized_name**, category, quantity, unit_price, line_total |

* Receipts are stored in the existing private `receipts` bucket under `<user id>/personal/...`, so the
  existing "own folder" storage policies already protect them.
* Expenses must sit inside one of the caller's own projects (checked in the RLS policy, not only in the UI).

## 3. Features and how they work

### Groceries
* **Scan** a receipt -> AI returns store, date, total and every line item (qty, unit price, line total,
  category). Without AI, a line-item parser reads "NAME ... PRICE" rows from the OCR text.
* **Review** screen: edit/add/remove items, see *items sum vs receipt total*, pick currency, save.
* **Item names are normalised** (lowercase, no punctuation, no size/brand noise, singularised) so
  "ORG BANANAS 1KG" and "Bananas" land on one price history.
* **Price tracker**: per item: last price, average, min/max, % change vs previous purchase, cheapest store,
  number of purchases, price history sparkline. Items whose price rose are flagged.
* **Monthly summary**: total per month, change vs previous month, spend by category (bars), top items,
  recent receipts.

### Home projects
* Create a project with an optional budget. Scan a ticket -> merchant, amount, date, category -> review ->
  save. Detail page: total spent, budget used (%), remaining, spend by category, expense list.

### Personal travel
* Same engine as projects with destination/dates and travel categories (Flights, Lodging, Food, ...).
  Foreign currencies are converted to USD with the same exchange-rate helper as business trips.
  Summary: total, by category, average per day, biggest expense.

## 4. Security checklist
* RLS on all 4 tables, tested with two users (read, insert, update, delete, cross-user inserts all blocked).
* Check constraints on money (>= 0), names (length), kinds and status.
* AI endpoint: login required, size/type limits, per-user hourly cap, output validated and clamped.
* No personal rows are written to the audit log or security events.

## 5. Execution plan
1. Run `supabase/migration_personal.sql` (adds tables, policies, toggle).
2. Deploy the app. Optional: set `GEMINI_API_KEY` for AI line items (basic OCR works without it).
3. Admin may switch the section off under Global Settings -> Branding.
4. Verify with a real grocery receipt, a project receipt and a travel receipt (checklist in section 6).

## 6. Test checklist
* Pure logic: name normalisation, line-item parser, price stats, monthly/category summaries (automated).
* Database: migration twice, RLS isolation, cascades, constraints (automated on a real Postgres).
* Type-check and production build of every new route (automated).
* Manual after deploy: scan 2 receipts of the same store a week apart and confirm the price change flag;
  create a project with a budget and confirm the % used; scan a foreign-currency travel receipt.

## 7. Known limits and next ideas
* Item matching is name-based; very different spellings of the same product may need a manual rename.
* Price comparison is per unit purchased, not per kg/litre. Next step: capture size and compare per unit.
* One currency per grocery receipt; summaries are shown per currency.
* Ideas: shopping list from frequent items, budget alerts, CSV export, shared household access.
