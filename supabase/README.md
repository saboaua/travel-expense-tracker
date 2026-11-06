# Database setup

Run these files in the Supabase **SQL Editor**, in this order. Paste the file's
*contents* (not its path). Most are safe to run more than once; the header comment of
each file says so when that is the case.

| # | File | What it adds |
|---|------|--------------|
| 1 | `schema.sql` | Base tables: profiles, trips, expenses, receipts storage policies |
| 2 | `migration_admin.sql` | Admin role and forced password change flag |
| 3 | `migration_profile.sql` | First/last name, title, avatar on profiles |
| 4 | `migration_trip_fields.sql` | Trip destination and category |
| 5 | `migration_currency.sql` | Multi-currency expenses with a frozen USD amount |
| 6 | `migration_currencies.sql` | Admin-managed list of currencies |
| 7 | `migration_categories.sql` | Admin-managed expense categories |
| 8 | `migration_travel_categories.sql` | Admin-managed travel categories and category icons |
| 9 | `migration_branding_roles.sql` | Branding settings and expanded roles |
| 10 | `migration_telegram.sql` | Telegram receipt upload |
| 11 | `migration_telegram_admin.sql` | Telegram credentials managed by admins |
| 12 | `migration_roles.sql` | Custom roles and per-feature access |
| 13 | `migration_temp_password.sql` | Expiry for temporary passwords |
| 14 | `migration_audit.sql` | Audit trail and security events |
| 15 | `migration_audit_triggers.sql` | Audit triggers for trips and expenses |
| 16 | `migration_documents.sql` | Passport and travel documents |
| 17 | `migration_documents_number.sql` | Document number column (after 16) |
| 18 | `migration_personal.sql` | Personal section: groceries, home projects, personal travel |
| 19 | `migration_grocery_categories.sql` | Admin-managed grocery categories |
| 20 | `migration_login_support.sql` | Login logo size, privacy text, support requests |
| 21 | `migration_security_hardening.sql` | Stops users changing their own role and other fixes |
| 22 | `migration_throttle_retention.sql` | Sign-in throttling counters and log retention |
| 23 | `migration_duplicates.sql` | Photo fingerprint column and the duplicate receipt check |
| 24 | `migration_telegram_v2.sql` | Telegram: message settings, sent log, held uploads |
| 25 | `migration_telegram_v3.sql` | Telegram: admin chat actions (confirmations) |
| 26 | `migration_telegram_v4.sql` | Telegram: remembers handled updates so a receipt is never saved twice |
| 27 | `migration_home_place.sql` | Home country and city on profiles (for Scan and Upload) |
| 28 | `migration_loyalty.sql` | Loyalty card wallet: cards table, private photo bucket, "loyalty" role option for every role (after 3 and 14) |

Keep a note of which files you have already run in your own project; the repository
cannot tell which ones are applied. A new project should run all of them.

## Checking the setup

Run `check_setup.sql` in the SQL Editor at any time. It changes nothing; it lists every table, column, function, trigger and
storage bucket the app expects, marks each OK or MISSING (with the file that fixes it), and lists anything extra the app does not use.
