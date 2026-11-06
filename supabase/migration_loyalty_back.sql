-- Loyalty cards: a second image for the back of the card.
-- The existing image_path stays as the front. Back images use the same private bucket and the same per-user
-- folder policies, so nothing else changes. Safe to run more than once.
alter table public.loyalty_cards add column if not exists back_image_path text;

notify pgrst, 'reload schema';
