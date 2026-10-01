-- EV Multi-Tracker: sharing fix #2
-- Run this in the SQL editor AFTER SUPABASE_SHARING.sql.
-- Everything here is idempotent.
--
-- Why this is needed
--   1. The sessions table has an ownership TRIGGER that RLS does not cover.
--      It compares vehicles.user_id with auth.uid(), so a legitimate shared
--      driver is rejected with "vehicle does not belong to this user" even
--      though the RLS policies already allow them.
--   2. The "vehicles accessible by members" policy was written FOR ALL, which
--      let a driver DELETE the car they were only lent.

-- ---------------------------------------------------------------------------
-- 1. Show what is there now (read-only, safe to run)
-- ---------------------------------------------------------------------------
select t.tgname,
       p.proname as function_name,
       pg_get_triggerdef(t.oid) as definition
from pg_trigger t
join pg_class c on c.oid = t.tgrelid
join pg_proc  p on p.oid = t.tgfoid
where c.relname = 'sessions'
  and not t.tgisinternal;

-- ---------------------------------------------------------------------------
-- 2. Replace the ownership trigger with one that honours sharing
--    Drops every non-internal trigger on sessions, then installs one check.
-- ---------------------------------------------------------------------------
do $$
declare
  r record;
begin
  for r in
    select t.tgname
    from pg_trigger t
    join pg_class c on c.oid = t.tgrelid
    where c.relname = 'sessions'
      and not t.tgisinternal
  loop
    execute format('drop trigger if exists %I on public.sessions', r.tgname);
  end loop;
end $$;

create or replace function public.sessions_vehicle_belongs_to_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.can_access_vehicle(new.vehicle_id) then
    raise exception 'vehicle does not belong to this user'
      using errcode = 'P0001';
  end if;
  return new;
end;
$$;

drop trigger if exists sessions_vehicle_owner_check on public.sessions;
create trigger sessions_vehicle_owner_check
  before insert or update of vehicle_id on public.sessions
  for each row execute function public.sessions_vehicle_belongs_to_user();

-- ---------------------------------------------------------------------------
-- 3. Lock vehicle edits to the owner
--    Drivers may read the car and add sessions; only the owner may rename it,
--    change the odometer or delete it.
-- ---------------------------------------------------------------------------
drop policy if exists "vehicles accessible by members" on public.vehicles;

drop policy if exists "vehicles readable by members" on public.vehicles;
create policy "vehicles readable by members"
  on public.vehicles for select
  using (public.can_access_vehicle(id));

drop policy if exists "vehicles editable by owner" on public.vehicles;
create policy "vehicles editable by owner"
  on public.vehicles for update
  using      (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists "vehicles removable by owner" on public.vehicles;
create policy "vehicles removable by owner"
  on public.vehicles for delete
  using (user_id = auth.uid());

-- sessions stay fully shared: every driver may add and correct entries
drop policy if exists "sessions of accessible vehicles" on public.sessions;
create policy "sessions of accessible vehicles"
  on public.sessions for all
  using      (public.can_access_vehicle(vehicle_id))
  with check (public.can_access_vehicle(vehicle_id) or user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- 4. Confirm
-- ---------------------------------------------------------------------------
select tgname, pg_get_triggerdef(oid)
from pg_trigger
where tgrelid = 'public.sessions'::regclass and not tgisinternal;

select policyname, cmd, permissive, qual, with_check
from pg_policies
where tablename in ('vehicles', 'sessions', 'vehicle_shares')
order by tablename, cmd;

-- ---------------------------------------------------------------------------
-- 5. Known, deliberate behaviour: a revoked driver keeps their OWN entries
-- ---------------------------------------------------------------------------
-- Postgres ORs together all PERMISSIVE policies on a table. The base schema
-- shipped a "own rows" policy on sessions (user_id = auth.uid()), which the
-- statements above do not drop because its name is not guaranteed. So after a
-- revoke the driver still reads back the entries they personally wrote, and
-- loses everything else:
--
--   can_access_vehicle -> false   (car and owner's entries gone)
--   read own sessions  -> true    (their own history retained)
--   any write          -> false   (blocked by the trigger and the policy)
--
-- This is the safe direction: revoking access never orphans or hides data
-- somebody actually created, and the app already drops sessions that have no
-- visible vehicle, so nothing reaches render() as an orphan row.
--
-- If you want a revoke to be total, delete the leftover policy using the real
-- name from the query in step 4:
--
--   alter table public.sessions drop policy "<name from step 4>";