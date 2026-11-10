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
| 29 | `migration_documents_license.sql` | Driver's license as a document type (after 16) |
| 30 | `migration_sharing.sql` | Partner sharing: loyalty cards (view only) and trip name, destination and dates. Closed tables, safe functions, leak failsafe, "Partner sharing" role option, off until an admin gives it to a role (after 3, 14, 28 and the audit migration) |
| 31 | `migration_help.sql` | Help section: topics written by admin and the assistant role, readable by every signed-in user, with two starter topics (after 3) |
| 32 | `migration_help_telegram.sql` | Help topic "Connect Telegram" (after 31; never overwrites your edits) |
| 33 | `migration_help_guides.sql` | Help topics: create a trip, add a trip receipt, import a grocery receipt, export a trip report (after 31) |
| 34 | `migration_dismissed_notices.sql` | Closed notices (bell, passport banner) are remembered on the account, so reinstalling the app does not bring them back (after 3) |
| 35 | `migration_sharing_safety.sql` | Sharing history (who opened what you shared, every change; kept 12 months), phone alert devices and switches, scheduled account deletion (7 days, cancellable). Needs migration 30 first |
| 36 | `migration_subscriptions.sql` | Personal "Subscriptions" (each person sees only their own) and admin-only IPTV clients: expiry and renewal dates, shareable client link, client logins ("IPTV client" role), and a switch that stops all client views. Needs migrations 3, 14 and the branding/roles one (app_settings, roles) |
| 37 | `migration_iptv_customers.sql` | One IPTV client can have several subscriptions: adds the client record (name, contact, the one shareable link and the client login) and moves each existing subscription under its own client. Needs migration 36 |
| 38 | `migration_iptv_manage.sql` | The IPTV clients page can be given to a role (Admin > Roles > "IPTV clients") instead of being admin only. Needs 36 and 37 |
| 39 | `migration_help_notifications.sql` | Help topics "Turn on phone alerts" and "Track your subscriptions". Needs migration_help.sql. Added once; edit afterwards in Admin > Help |
| 40 | `migration_documents_show_on.sql` | Each document gets a "Show on" choice (Personal, Business or Both) that decides which home dashboard lists it. Existing documents stay on both. Needs migration_documents.sql |
| 41 | `migration_help_documents.sql` | Help topic "Add your documents" (scanning, Show on Personal / Business / Both, expiry badges). Needs migration_help.sql. Added once; edit afterwards in Admin > Help |
| 42 | `migration_help_profile_photo.sql` | Help topic "Add your photo to your profile". Needs migration_help.sql. Added once; edit afterwards in Admin > Help |

Keep a note of which files you have already run in your own project; the repository
cannot tell which ones are applied. A new project should run all of them.

## Checking the setup

Run `check_setup.sql` in the SQL Editor at any time. It changes nothing; it lists every table, column, function, trigger and
storage bucket the app expects, marks each OK or MISSING (with the file that fixes it), and lists anything extra the app does not use.
