-- Several license plates (up to 3), each with an optional plate number.
-- Your current plate stays as plate 1 and nothing about your numbers changes. Safe to run more than once.

alter table public.fixed_costs add column if not exists label text;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'fixed_costs_label_len') then
    alter table public.fixed_costs add constraint fixed_costs_label_len check (label is null or char_length(label) <= 16);
  end if;
end $$;

-- plates 2 and 3 are their own kinds (one row per kind per person stays true)
alter table public.fixed_costs drop constraint if exists fixed_costs_kind_check;
alter table public.fixed_costs add constraint fixed_costs_kind_check
  check (kind in ('mortgage','home_insurance','car_loan','car_insurance','license_plate','license_plate_2','license_plate_3','credit_card','gambling'));
