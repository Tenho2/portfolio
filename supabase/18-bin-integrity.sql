-- EV Multi-Tracker: bin and ownership integrity
-- Run this in the Supabase SQL editor AFTER 17-invite-at-usernames.sql.
--
-- What it fixes
--   1. sessions.vehicle_id must cascade when a vehicle is hard-deleted.
--   2. Sessions already orphaned by an earlier delete are archived and removed.
--
-- Why this exists
--   The original vehicles/sessions tables were created outside this repository,
--   so their foreign keys were not visible in the migration history. A vehicle
--   hard-delete without ON DELETE CASCADE leaves session rows pointing at an id
--   that no longer exists. RLS cannot show those rows to anyone, and syncPull()
--   deliberately drops them because their parent is gone. They are therefore
--   invisible leftovers, not recoverable bin rows.
--
-- The backup tables
--   Orphaned sessions are copied to public.orphaned_sessions before deletion,
--   along with their payer splits in public.orphaned_session_payers. They are
--   already unreachable through the app, so deleting them is safe, but keeping
--   a copy makes the migration auditable and recoverable from SQL.
--
-- Everything here is idempotent.

-- To inspect the current state before changing anything, run the two
-- preflight SELECTs below on their own first. Running the whole file archives
-- and deletes in one transaction.
--
-- Run the whole file as one transaction. A failure must not leave the archive
-- half-copied, the sessions deleted and the foreign key unchanged. The lock
-- blocks writes to both tables while the archive and constraint swap happen, so
-- a vehicle deleted by another tab cannot create a new orphan halfway through.
begin;
lock table public.vehicles, public.sessions in share row exclusive mode;

-- ---------------------------------------------------------------------------
-- 1. Preflight: show the current foreign key and any orphans.
-- ---------------------------------------------------------------------------
select
  conname,
  confdeltype, -- 'c' = cascade, 'a' = no action, 'r' = restrict, etc.
  pg_get_constraintdef(oid) as definition
from pg_constraint
where conrelid = 'public.sessions'::regclass
  and confrelid = 'public.vehicles'::regclass
  and contype = 'f';

select count(*) as orphan_sessions
from public.sessions s
left join public.vehicles v on v.id = s.vehicle_id
where v.id is null;

-- ---------------------------------------------------------------------------
-- 2. Archive orphaned sessions before removing them.
-- ---------------------------------------------------------------------------
create table if not exists public.orphaned_sessions as
select *
from public.sessions
where false;

insert into public.orphaned_sessions
select s.*
from public.sessions s
left join public.vehicles v on v.id = s.vehicle_id
where v.id is null
  and not exists (
    select 1 from public.orphaned_sessions o where o.id = s.id
  );

-- The archive is not app data. Keep it out of the API entirely.
alter table public.orphaned_sessions enable row level security;
revoke all on public.orphaned_sessions from anon, authenticated;

-- Payer splits hang off the session with ON DELETE CASCADE. Archive them too,
-- otherwise deleting an orphaned session silently takes its split with it.
create table if not exists public.orphaned_session_payers as
select *
from public.session_payers
where false;

insert into public.orphaned_session_payers
select p.*
from public.session_payers p
join public.sessions s on s.id = p.session_id
left join public.vehicles v on v.id = s.vehicle_id
where v.id is null
  and not exists (
    select 1
    from public.orphaned_session_payers o
    where o.session_id = p.session_id
      and o.name = p.name
  );

alter table public.orphaned_session_payers enable row level security;
revoke all on public.orphaned_session_payers from anon, authenticated;

delete from public.sessions s
where not exists (
  select 1 from public.vehicles v where v.id = s.vehicle_id
);

-- ---------------------------------------------------------------------------
-- 3. Replace every sessions -> vehicles foreign key with ON DELETE CASCADE.
--    Done through the catalogue because the original constraint name is not
--    recorded in this repository.
-- ---------------------------------------------------------------------------
do $$
declare
  fk record;
begin
  for fk in
    select conname
    from pg_constraint
    where conrelid = 'public.sessions'::regclass
      and confrelid = 'public.vehicles'::regclass
      and contype = 'f'
  loop
    execute format('alter table public.sessions drop constraint %I', fk.conname);
  end loop;
end $$;

alter table public.sessions
  drop constraint if exists sessions_vehicle_id_fkey;

alter table public.sessions
  add constraint sessions_vehicle_id_fkey
  foreign key (vehicle_id)
  references public.vehicles(id)
  on delete cascade;

-- ---------------------------------------------------------------------------
-- 4. Verify: exactly one cascading FK and no remaining orphans.
-- ---------------------------------------------------------------------------
select
  conname,
  confdeltype,
  pg_get_constraintdef(oid) as definition
from pg_constraint
where conrelid = 'public.sessions'::regclass
  and confrelid = 'public.vehicles'::regclass
  and contype = 'f';

select count(*) as orphan_sessions_remaining
from public.sessions s
left join public.vehicles v on v.id = s.vehicle_id
where v.id is null;

commit;
