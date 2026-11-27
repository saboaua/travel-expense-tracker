-- Payment type chosen for each order sender (amazon, aliexpress, ebay), for example {"ebay": "debit"}. A site with no entry uses paid_with.
alter table public.online_order_prefs add column if not exists paid_by_site jsonb not null default '{}'::jsonb;

-- The help guides name the screen's parts: keep them in step with the Email inbox page.
update public.help_topics
set body = replace(replace(replace(body, 'Allowed senders', 'Senders'), 'Recent emails', 'Received'), 'Add bills from email', 'Email inbox')
where body like '%Allowed senders%' or body like '%Recent emails%' or body like '%Add bills from email%';
