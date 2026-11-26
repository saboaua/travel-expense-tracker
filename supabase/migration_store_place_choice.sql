-- Smart cart: remember which place you chose for a store ("Which place is this store?").
alter table public.store_locations add column if not exists preferred boolean not null default false;
