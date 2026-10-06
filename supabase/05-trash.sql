-- EV Multi-Tracker: the bin (recoverable deletes)
-- Run this in the Supabase SQL editor AFTER 04-roles.sql.
-- Dashboard -> SQL Editor -> New query -> paste -> Run.
--
-- Everything here is idempotent.
--
-- What it does
--   Adds a deleted_at column to vehicles and sessions. A "delete" sets the
--   timestamp instead of removing the row, so the app can list it in the bin
--   and put it back. Emptying the bin is a real DELETE, which the existing
--   policies already allow.
--
-- Why it is a column and not a separate trash table
--   A trash table would need the full schema duplicated and would drift. The
--   timestamp keeps the row exactly where every policy, index and trigger
--   already understands it, so restoring is just clearing one column.
--
-- Why no policy is changed here
--   Deliberate. The RLS policies keep matching binned rows, because the app has
--   to be able to READ them to show the bin at all. Filtering is done in the
--   client instead, at ofVehicle() and where the bin view is built. That means
--   this migration cannot weaken access control: a binned row is readable by
--   exactly the same people who could read it before it was deleted, and no
--   more.
--
--   The trade-off is that deleted rows are still transferred on every sync
--   pull. For a personal tracker that is a non-issue, and it is what makes the
--   bin work offline and across devices.
--
--   Note this also means "delete" is not a privacy operation. The data is still
--   in the database until the bin is emptied. The app says so in the warning.

-- ---------------------------------------------------------------------------
-- 1. Columns
-- ---------------------------------------------------------------------------
alter table public.vehicles
  add column if not exists deleted_at timestamptz;

alter table public.sessions
  add column if not exists deleted_at timestamptz;

-- ---------------------------------------------------------------------------
-- 2. Indexes
--    The bin lists rows WHERE deleted_at IS NOT NULL ordered newest first, and
--    every live query filters the same column, so both directions want one.
-- ---------------------------------------------------------------------------
create index if not exists vehicles_deleted_at_idx
  on public.vehicles (deleted_at)
  where deleted_at is not null;

create index if not exists sessions_deleted_at_idx
  on public.sessions (deleted_at)
  where deleted_at is not null;

-- The vehicle each binned session belongs to. The bin groups sessions under
-- their car, and sessions are always fetched by vehicle.
create index if not exists sessions_vehicle_deleted_idx
  on public.sessions (vehicle_id, deleted_at);

-- ---------------------------------------------------------------------------
-- 3. Nothing to grant
--    Setting or clearing deleted_at is an ordinary UPDATE, and the policies
--    from 04-roles.sql already gate it:
--
--      vehicles  "vehicles editable by owner or admin"
--                USING/WITH CHECK can_edit_vehicle(id)
--                -> the author or an admin can bin and restore a vehicle.
--                -> ownership is unchanged by binning, and the separate
--                   vehicles_owner_immutable trigger is what guarantees that:
--                   it compares the new owner against the old one on every
--                   UPDATE, which a policy cannot do because a WITH CHECK only
--                   ever sees the new row. (The policy used to end with "and
--                   user_id = auth.uid()", on the reasoning that user_id never
--                   changes. That held for the owner and failed for the admin,
--                   who is not the owner - so every admin edit, including
--                   binning somebody else's vehicle, was refused with 42501.)
--
--      sessions  "sessions editable by author or admin"
--                USING/WITH CHECK can_edit_session(vehicle_id, user_id)
--                -> a driver can bin and restore their own sessions only.
--
--      emptying the bin is a DELETE, covered by
--                "vehicles removable by owner" and
--                "sessions removable by author or admin".
--
--    The sessions trigger sessions_vehicle_owner_check fires BEFORE UPDATE and
--    asks can_edit_session(new.vehicle_id, new.user_id), which is the same
--    question the policy asks. Binning therefore cannot bypass the trigger, and
--    a driver still cannot bin somebody else's session by going through it.
--
--    A viewer resolves to rank 1 and can do none of this, which is what stops a
--    read-only member from emptying the bin.

-- ---------------------------------------------------------------------------
-- 4. Confirm
-- ---------------------------------------------------------------------------
select table_name, column_name, data_type
from information_schema.columns
where table_schema = 'public'
  and table_name in ('vehicles', 'sessions')
  and column_name = 'deleted_at'
order by table_name;

select indexname, indexdef
from pg_indexes
where schemaname = 'public'
  and tablename in ('vehicles', 'sessions')
  and indexname like '%deleted%'
order by indexname;

-- Everything currently in the bin. Expect no rows on a fresh install.
select 'vehicle' as kind, id, name as label, deleted_at
from public.vehicles
where deleted_at is not null
union all
select 'session', id, location, deleted_at
from public.sessions
where deleted_at is not null
order by deleted_at desc
limit 50;

-- ---------------------------------------------------------------------------
-- 5. Purging from the database
--    The app's "Empty bin" button does this through the normal delete path, so
--    no function is needed. If you ever want it from the SQL editor instead:
--
--    delete from public.sessions where deleted_at is not null;
--    delete from public.vehicles where deleted_at is not null;
--
--    Both are covered by the delete policies when run as the table owner, which
--    the SQL editor is. Rows are only matched here when a timestamp is set, so
--    this can never touch live data.
-- ---------------------------------------------------------------------------
