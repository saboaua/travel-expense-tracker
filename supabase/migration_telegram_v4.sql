-- Telegram, part 4: remember which updates were already handled, so a re-delivery from Telegram
-- (it re-sends when a reply is slow) cannot save a receipt twice. Server only (service role). Run once.
create table if not exists public.telegram_updates (
  update_id bigint primary key,
  received_at timestamptz not null default now()
);
alter table public.telegram_updates enable row level security;
create index if not exists telegram_updates_received_idx on public.telegram_updates (received_at);
