-- Loyalty card wallet (Personal section).
-- Run in the Supabase SQL Editor (safe to run more than once). Needs migration_roles.sql and migration_personal.sql first.
--
-- * Every card belongs to one person: only that person can see, change or delete it. Not even other admins.
-- * The "loyalty" feature is a role option (Admin > Roles). This file turns it on for every role that exists today,
--   so everyone can use the wallet right away. An admin can switch it off for a role later.
-- * The database itself checks the role, not just the menu: a role without "loyalty" cannot read or write cards.

create table if not exists public.loyalty_cards (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  store_name text not null check (char_length(store_name) between 1 and 80),
  holder_name text check (holder_name is null or char_length(holder_name) <= 80),
  category text check (category is null or char_length(category) <= 40),      -- "Rewards", "Coffee club", ...
  card_number text not null check (char_length(card_number) between 1 and 128),
  barcode_format text not null default 'CODE128' check (barcode_format in ('CODE128','QR','EAN13','UPCA')),
  color text check (color is null or color ~ '^#[0-9a-fA-F]{6}$'),
  image_path text,                                                              -- compressed photo in the private bucket
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists loyalty_cards_user_idx on public.loyalty_cards (user_id, store_name);

create or replace function public.personal_touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists loyalty_cards_touch on public.loyalty_cards;
create trigger loyalty_cards_touch before update on public.loyalty_cards
  for each row execute function public.personal_touch_updated_at();

-- Row level security: owner only, and only while the role has the "loyalty" feature
alter table public.loyalty_cards enable row level security;

drop policy if exists "Own loyalty cards" on public.loyalty_cards;
create policy "Own loyalty cards" on public.loyalty_cards
  for all to authenticated
  using (user_id = (select auth.uid()) and public.has_permission('loyalty'))
  with check (user_id = (select auth.uid()) and public.has_permission('loyalty'));

-- Private bucket for the card photos. Objects live under <user id>/...
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('loyalty-cards', 'loyalty-cards', false, 1048576, array['image/webp','image/jpeg','image/png'])
on conflict (id) do nothing;

drop policy if exists "Own loyalty images read" on storage.objects;
create policy "Own loyalty images read" on storage.objects for select to authenticated
  using (bucket_id = 'loyalty-cards' and (storage.foldername(name))[1] = (select auth.uid())::text and public.has_permission('loyalty'));

drop policy if exists "Own loyalty images insert" on storage.objects;
create policy "Own loyalty images insert" on storage.objects for insert to authenticated
  with check (bucket_id = 'loyalty-cards' and (storage.foldername(name))[1] = (select auth.uid())::text and public.has_permission('loyalty'));

drop policy if exists "Own loyalty images update" on storage.objects;
create policy "Own loyalty images update" on storage.objects for update to authenticated
  using (bucket_id = 'loyalty-cards' and (storage.foldername(name))[1] = (select auth.uid())::text and public.has_permission('loyalty'))
  with check (bucket_id = 'loyalty-cards' and (storage.foldername(name))[1] = (select auth.uid())::text and public.has_permission('loyalty'));

drop policy if exists "Own loyalty images delete" on storage.objects;
create policy "Own loyalty images delete" on storage.objects for delete to authenticated
  using (bucket_id = 'loyalty-cards' and (storage.foldername(name))[1] = (select auth.uid())::text);

-- Give the new "loyalty" option to every role that exists (admin has everything already) and mark it reviewed,
-- so it does not show up as "New" in Admin > Roles. Roles created later start without it, as with any option.
update public.roles
set permissions = array_append(permissions, 'loyalty')
where key <> 'admin' and not ('loyalty' = any (permissions));

update public.roles
set known_features = array_append(known_features, 'loyalty')
where key <> 'admin' and not ('loyalty' = any (known_features));

notify pgrst, 'reload schema';
