-- Migration 44: Help topics for your account: change your password, set your personal information, set your home place,
-- and download or delete your data (all on the Profile page).
-- Run in the Supabase SQL Editor (safe to run more than once). Needs migration_help.sql first.
-- Each topic is added only the first time: after that, edit it in Admin > Help (a re-run never overwrites your edits).

insert into public.help_topics (slug, title, category, summary, body, sort_order) values

('change-your-password', 'Change your password', 'Your account',
 'Choose a new password for signing in. It takes less than a minute.',
$h$You can change your password at any time while you are signed in.

## Change it
1. Open **Profile** from the menu.
2. Open the **Password** section ("Change how you sign in").
3. Type your **New Password**. It needs at least 8 characters. Tap the eye to check what you typed.
4. Type it again under **Confirm New Password**.
5. Tap **Update Password**. You see **Password updated successfully**.

Use the new password the next time you sign in.

## Tips
- Pick something you do not use anywhere else. A few words strung together is long and easy to remember.
- If the two passwords do not match, or the new one is too short, the app tells you what to fix.
- **Forgot your password?** On the sign-in page, use the forgot-password link, or ask your administrator to give you a temporary one. You are asked to choose your own the first time you sign in with it.$h$, 7),

('set-personal-information', 'Set your personal information', 'Your account',
 'Add your name, job title and company so the app greets you properly.',
$h$Your personal information is your name, job title, company and email. The app uses your name to greet you on the home page.

## Update it
1. Open **Profile** from the menu.
2. Open the **Personal information** section ("Update your profile details").
3. Fill in your **First Name** and **Last Name**.
4. Add your **Title / Job Title** and **Company** if you like. Both are optional.
5. Check your **Email**.
6. Tap **Save Changes**. You see **Profile saved successfully**.

## Good to know
- Your name shows next to your photo at the top of the home page and on your profile.
- To add or change your picture, see "Add your photo to your profile".
- Only you and your administrator can see this information.$h$, 8),

('set-home-place', 'Set your home place', 'Your account',
 'Tell the app where you live, so receipts scanned at home are suggested as personal and not as a business trip.',
$h$Your home place is the country, and optionally the city, where you live. The app uses it to guess where a scanned receipt belongs: a receipt from home, such as groceries, is suggested as **personal**, while one from somewhere else is suggested for a **business trip**.

## Set it
1. Open **Profile** from the menu.
2. Open the **Home place** section.
3. Type your **Country**, for example *Aruba*.
4. Optionally type your **City**, for example *Oranjestad*.
5. Tap **Save**.

## Let your phone fill it in
Tap **Use where I am now** while you are at home. Your phone asks permission to share your location, and the country and city are filled in for you. Check them, then tap **Save**. Your exact position is not stored, only the country and city.

## Good to know
- You can change it any time, for example after a move.
- The section shows your place when it is closed, or **Not set** if you have not chosen one yet.$h$, 9),

('download-or-delete-your-data', 'Download or delete your data', 'Your account',
 'Take a copy of everything you have stored here, or remove your account and all its data for good.',
$h$You are in control of your data. You can download a copy of everything, and you can delete your account. Both are in **Profile**, in the **Your data** section.

## Download a copy
1. Open **Profile**, then **Your data**.
2. Under **Export my data**, tap **Prepare my download**. Keep the page open while it works. A large account can take a minute.
3. When **Your export is ready** appears, tap **Download**.

You get one ZIP file with your profile and settings, trips and receipts with their photos, personal spending, projects and grocery receipts, loyalty cards and document details, and your sharing history.

## Delete your account
1. Open **Profile**, then **Your data**.
2. Under **Delete account and all data**, tap **Delete my account...**.
3. Read what will be removed. Type your **email** to confirm.
4. Tap **Schedule deletion**.

**Nothing is deleted for 7 days.** Until then your account works as normal, and you can change your mind. Sharing with partners is switched off from the moment you schedule the deletion and stays off.

After the 7 days your trips and receipts with their photos, personal spending and grocery receipts, loyalty cards and documents, and everything shared with your partners are removed for good. This cannot be undone.

## Change your mind
Open **Profile**, then **Your data**, and tap **Cancel deletion**. Download your data first if you want a copy to keep.$h$, 10)

on conflict (slug) do nothing;
