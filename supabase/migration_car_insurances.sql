-- Several car insurances (up to 3, one for each car). Your current insurance stays as insurance 1.
-- Needs migration_license_plates.sql first (it adds the optional name column). Safe to run more than once.

alter table public.fixed_costs add column if not exists label text;

alter table public.fixed_costs drop constraint if exists fixed_costs_kind_check;
alter table public.fixed_costs add constraint fixed_costs_kind_check
  check (kind in ('mortgage','home_insurance','car_loan','car_insurance','car_insurance_2','car_insurance_3','license_plate','license_plate_2','license_plate_3','credit_card','gambling'));
