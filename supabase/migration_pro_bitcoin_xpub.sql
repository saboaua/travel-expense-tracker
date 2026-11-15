-- Bitcoin from a wallet public key (xpub, ypub or zpub). Run once, after migration_pro_bitcoin.sql. Safe to run again.
-- The key lets the app make receiving addresses. It cannot spend. It sits in its own table that only the server can read,
-- so a signed-in person can never read it from the browser (payment_settings is readable by everyone signed in).

create table if not exists public.btc_wallet (
  id int primary key default 1 check (id = 1),
  xpub text,
  xpub_type text check (xpub_type in ('legacy','segwit','native')),
  xpub_fp text,
  next_index int not null default 0 check (next_index >= 0),
  updated_at timestamptz not null default now()
);
alter table public.btc_wallet enable row level security;
insert into public.btc_wallet (id) values (1) on conflict (id) do nothing;

alter table public.btc_addresses add column if not exists derive_index int;
create unique index if not exists btc_addresses_derive_idx on public.btc_addresses (derive_index) where derive_index is not null;
