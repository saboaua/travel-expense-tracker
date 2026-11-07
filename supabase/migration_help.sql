-- Help section: topics that admins (and the assistant role) write and every signed-in user can read.
-- Run in the Supabase SQL Editor (safe to run more than once). Needs migration_roles.sql first.
--
--  * Everyone signed in can read PUBLISHED topics. Drafts are visible only to people who can manage help.
--  * Only roles with the "help.manage" option can add, change or delete topics. This file gives it to the "assistant" role;
--    admin always has every option. More roles can be given it in Admin > Roles.
--  * The topic text is plain text with a few simple marks (see src/lib/help.ts). The app never treats it as HTML.

create table if not exists public.help_topics (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and char_length(slug) <= 80),
  title text not null check (char_length(trim(title)) between 2 and 120),
  category text not null default 'General' check (char_length(trim(category)) between 1 and 40),
  summary text not null default '' check (char_length(summary) <= 240),
  body text not null default '' check (char_length(body) <= 8000),
  sort_order integer not null default 100,
  published boolean not null default true,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists help_topics_order_idx on public.help_topics (category, sort_order, title);

create or replace function public.personal_touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists help_topics_touch on public.help_topics;
create trigger help_topics_touch before update on public.help_topics
  for each row execute function public.personal_touch_updated_at();

alter table public.help_topics enable row level security;

drop policy if exists "Read help topics" on public.help_topics;
create policy "Read help topics" on public.help_topics for select to authenticated
  using (published or public.has_permission('help.manage'));

drop policy if exists "Add help topics" on public.help_topics;
create policy "Add help topics" on public.help_topics for insert to authenticated
  with check (public.has_permission('help.manage'));

drop policy if exists "Change help topics" on public.help_topics;
create policy "Change help topics" on public.help_topics for update to authenticated
  using (public.has_permission('help.manage')) with check (public.has_permission('help.manage'));

drop policy if exists "Delete help topics" on public.help_topics;
create policy "Delete help topics" on public.help_topics for delete to authenticated
  using (public.has_permission('help.manage'));

revoke all on public.help_topics from anon;
grant select, insert, update, delete on public.help_topics to authenticated;

-- The assistant role can manage help. Other roles are not touched (an admin can give it to them in Admin > Roles).
update public.roles set permissions = array_append(permissions, 'help.manage')
  where key = 'assistant' and not ('help.manage' = any (permissions));
update public.roles set known_features = array_append(known_features, 'help.manage')
  where key in ('assistant', 'user') and not ('help.manage' = any (known_features));

-- Two starter topics (only added the first time: edit or delete them freely afterwards)
insert into public.help_topics (slug, title, category, summary, body, sort_order) values
('add-to-home-screen', 'Add the app to your home screen', 'Getting started',
 'Open it like any other app, full screen, with its own icon.',
$h$It opens faster, runs full screen, and you stay signed in. It takes less than a minute.

## iPhone and iPad
1. Open the app in **Safari** (it must be Safari, not Chrome).
2. Tap the **Share** button (the square with an arrow pointing up).
3. Scroll down and tap **Add to Home Screen**.
4. Tap **Add**. The icon now appears on your home screen.

## Android
1. Open the app in **Chrome**.
2. Tap the **three dots** at the top right.
3. Tap **Install app** (or **Add to Home screen**).
4. Tap **Install**.

## Computer (Chrome or Edge)
1. Open the app in the browser.
2. Click the **install icon** at the right end of the address bar, or open the browser menu and choose **Install**.
3. Click **Install**. The app opens in its own window.

> Tip: if you do not see the option on iPhone, make sure you are in Safari and not inside another app's built-in browser.$h$, 10),
('share-with-partner', 'Share with a partner', 'Sharing',
 'Let someone you trust see a loyalty card or the dates of a trip. Nothing is shared unless you choose it.',
$h$You decide exactly what is shared, and with whom. A partner can only **view**: they cannot change or delete anything.

## What a partner can see
- A loyalty card you share: the card and its barcode.
- A trip you share: its name, destination and dates. Never receipts, costs or notes.

## Turn sharing on and invite someone
1. Open **Profile** and find the **Sharing** section.
2. Tap **Turn on sharing**.
3. Tap **Add a partner** and type their email address.
4. Tap **Send invite**. Their invite waits under the bell in the app. You can have up to 4 partners.

> Tip: the invite is not sent by email. Tell your partner to sign in and look at the bell.

## Accept an invite
1. Sign in and tap the **bell**. You will see the invite.
2. Tap **Accept**. You can also **Decline**, or **Block** to stop that person from inviting you again.

## Choose what to share
1. Open a loyalty card or a trip.
2. Under **Share with**, turn on the switch next to your partner.
3. Turn it off at any time and it disappears for them straight away.

## Stop sharing
In **Profile**, under **Sharing**, you can stop one item, or end the partnership. Ending it removes everything you shared.

> Sharing is off until an administrator gives your role the option. If you do not see the Sharing section, ask them.$h$, 20)
on conflict (slug) do nothing;
