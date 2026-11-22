-- The colour of the Other row on the Personal page. Each person picks their own; empty means the default rose.
-- Run once in the Supabase SQL Editor.
alter table public.profiles add column if not exists other_color text check (other_color is null or other_color ~ '^#[0-9a-fA-F]{6}$');
