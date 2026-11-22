-- Your own icon colours for the Personal pages (Monthly budget, Fixed costs, Groceries and so on).
-- One small list per person; empty means every page keeps its standard colour. Run once in the Supabase SQL Editor.
alter table public.profiles add column if not exists tile_colors jsonb not null default '{}'::jsonb;

-- Keep the colour already picked for Other, if migration_other_color.sql was run before
do $$
begin
  if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'profiles' and column_name = 'other_color') then
    update public.profiles set tile_colors = jsonb_build_object('types', other_color) where other_color is not null and tile_colors = '{}'::jsonb;
  end if;
end $$;
