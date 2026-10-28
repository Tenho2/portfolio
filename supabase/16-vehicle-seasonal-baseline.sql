-- ChargeDesk 3.11: seasonal baseline consumption per vehicle.
-- Run this in the Supabase SQL editor AFTER 15-vehicle-baseline.sql.
-- Dashboard -> SQL Editor -> New query -> paste -> Run.
--
-- Everything here is idempotent.
--
-- What it does
--   Adds two nullable columns to public.vehicles:
--
--     baseline_summer_kwh_100km  the figure on summer tires
--     baseline_winter_kwh_100km  the figure on winter tires
--
-- Why two seasonal figures
--   The all-year baseline from migration 15 anchors the headline. But winter
--   tires routinely cost 10-25% more energy, and a single figure cannot be
--   right for both seasons. These columns let the winter and summer tiles use
--   their own anchor while keeping the existing all-year figure as the
--   headline fallback.
--
--   They share baseline_distance_km from migration 15. The distance is "how
--   much evidence this figure represents", and the two seasonal figures are
--   normally supplied from the same driving history. A per-season distance can
--   be added later if a user actually needs it.
--
-- Why both remain nullable
--   A vehicle may have only one seasonal figure, or none. The arithmetic falls
--   back in this order: seasonal value -> all-year value -> measured data only.
--   Null means "not set"; the editor rejects zero and negative values.
--
--   No CHECK constraint, for the same reason as migrations 12 and 15: an old
--   backup containing a blank or odd value must not turn a restore into a hard
--   failure. The editor clamps what a person types.
--
-- What it does NOT touch
--   No policy, no trigger, no grant. RLS on vehicles is row-level and Supabase
--   grants table-level privileges, so these columns are readable and writable by
--   exactly the people who could already read and write the row.
--
-- Idempotency
--   add column if not exists, so re-running is a no-op rather than an error.

alter table public.vehicles
  add column if not exists baseline_summer_kwh_100km numeric;

alter table public.vehicles
  add column if not exists baseline_winter_kwh_100km numeric;

-- ---------------------------------------------------------------------------
-- Verify after running (expect two rows):
--   select column_name, data_type, is_nullable
--     from information_schema.columns
--    where table_name = 'vehicles'
--      and column_name in ('baseline_summer_kwh_100km',
--                          'baseline_winter_kwh_100km')
--    order by column_name;
--
-- Set seasonal figures for a vehicle (summer 16.5, winter 20.2):
--   update public.vehicles
--      set baseline_summer_kwh_100km = 16.5,
--          baseline_winter_kwh_100km = 20.2
--    where name = 'Tucson';
--
-- Read them back:
--   select id, name, baseline_consumption_kwh_100km,
--          baseline_summer_kwh_100km, baseline_winter_kwh_100km,
--          baseline_distance_km
--     from public.vehicles order by name;
