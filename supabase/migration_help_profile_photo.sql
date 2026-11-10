-- Migration 42: Help topic "Add your photo to your profile".
-- Run in the Supabase SQL Editor (safe to run more than once). Needs migration_help.sql first.
-- Added only the first time: after that, edit it in Admin > Help (a re-run never overwrites your edits).

insert into public.help_topics (slug, title, category, summary, body, sort_order) values
('add-profile-photo', 'Add your photo to your profile', 'Getting started',
 'Put your picture on your profile so it shows next to your name on the home page.',
$h$Your photo shows on your profile and next to your name at the top of the home page. Only you choose it, and you can change it at any time.

## Add or change your photo
1. Open **Profile** from the menu.
2. At the top you see your picture (or a grey person icon if you have none yet). Tap the **camera button** on its corner.
3. Choose a photo from your phone or computer, or take one with the camera if your phone offers it.
4. Wait for **Uploading photo...** to finish. Your new picture appears straight away.

## Tips
- Use a **JPG, PNG or WebP** photo. A clear picture of your face, taken close up, looks best because the picture is shown in a small circle.
- Large photos are shrunk for you before they are saved, so you do not need to resize them.
- If you do not see the new picture on the home page, refresh the page or open the app again.

## If it does not work
- **"This image format could not be processed":** choose a JPG, PNG or WebP photo (some phones save photos as HEIC, which a browser may not read).
- **Another error:** check your connection and try again. If it keeps failing, tell your administrator: the photo storage may not be set up yet.

## Change your name and details
Under **Personal information** on the same page you can update your name, title and company.$h$, 5)
on conflict (slug) do nothing;
