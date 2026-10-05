-- EV Multi-Tracker: TEMPORARY diagnostic. Supersedes the aborting v1 probe.
--
-- If v1 is still installed on your database, drop it first:
--   drop trigger if exists vehicles_zz_probe on public.vehicles;
--   drop function if exists public.probe_vehicles_insert();
-- This file does both of those itself, so running it is enough.
--
-- What v1 got right, and what it got wrong
--   v1 attached a BEFORE INSERT trigger that raised an exception. It proved the
--   statement really is an INSERT into public.vehicles, that both BEFORE
--   triggers run in the right order, and that vehicles_stamp_owner has already
--   written user_id = auth.uid() by the time the second trigger sees the row:
--
--     PROBE fired: tg_op=INSERT, auth.uid()=e98e91ee…, new.user_id=e98e91ee…
--
--   So the stamp works and the policy has nothing left to refuse, yet the insert
--   was refused with 42501. v1 could not explain that, because raising an
--   exception ABORTS the insert. It replaced the 42501 with a P0001 and never
--   reached the WITH CHECK evaluation at all. It measured everything up to the
--   trigger and nothing after it.
--
-- What this one does instead
--   It writes a row to a log table and RETURNS NEW, so the insert continues to
--   the policy check exactly as it would normally. Then:
--
--     * read the log to see what the policy expression evaluates to, computed
--       here rather than inferred, and
--     * see whether the insert actually failed this time.
--
--   policy_ok below is literally the policy's own expression,
--   (user_id = auth.uid()), evaluated at the instant the policy will evaluate
--   it. If it reads true and the insert is still refused with 42501, then the
--   refusal is demonstrably not coming from that policy, which is the only way
--   to settle it.

begin;

-- ---------------------------------------------------------------------------
-- 1. Remove the v1 probe. Left installed it would abort every insert and mask
--    whatever this one is trying to observe.
-- ---------------------------------------------------------------------------
drop trigger if exists vehicles_zz_probe on public.vehicles;
drop function if exists public.probe_vehicles_insert();

-- ---------------------------------------------------------------------------
-- 2. The log
--
--    Granted explicitly. The probe is SECURITY INVOKER, so it writes as
--    `authenticated`, and a bare CREATE TABLE does not reliably grant that role
--    INSERT on every project. Without this the trigger would fail on permissions
--    and the app would report something unrelated to what we are measuring.
-- ---------------------------------------------------------------------------
drop table if exists public.trigger_probe_log;
create table public.trigger_probe_log (
  id               bigint generated always as identity primary key,
  seen_at          timestamptz not null default now(),
  tg_op            text,
  auth_uid         uuid,
  new_user_id      uuid,
  policy_ok        boolean,
  new_id           uuid,
  -- Prefixed, because SESSION_USER and CURRENT_USER are reserved words in
  -- PostgreSQL and cannot be used bare as column names. An earlier draft used
  -- them directly and failed with 42601 at the CREATE TABLE.
  db_session_user  text,
  db_current_user  text
);

-- RLS switched OFF for this table. It is a temporary diagnostic and holds no
-- user data beyond ids the caller already knows, but leaving RLS on with no
-- INSERT policy made the probe's own insert fail with
--
--   42501 new row violates row-level policy for table "trigger_probe_log"
--
-- which aborted the vehicle insert from inside the trigger and replaced the
-- error we were chasing with one about our own scaffolding. Explicitly granted
-- below as well, so the permissions do not depend on project defaults.
alter table public.trigger_probe_log disable row level security;

grant insert on public.trigger_probe_log to authenticated;
grant select on public.trigger_probe_log to authenticated, anon;
grant usage, select on sequence public.trigger_probe_log_id_seq to authenticated;

-- ---------------------------------------------------------------------------
-- 3. The probe. Alphabetically after vehicles_stamp_owner, so it observes the
--    stamped value rather than the one the client sent.
-- ---------------------------------------------------------------------------
create or replace function public.probe_vehicles_insert()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  insert into public.trigger_probe_log (
    tg_op, auth_uid, new_user_id, policy_ok, new_id,
    db_session_user, db_current_user
  )
  values (
    tg_op,
    auth.uid(),
    new.user_id,
    (new.user_id = auth.uid()),
    new.id,
    session_user,
    current_user
  );
  return new;
end;
$$;

drop trigger if exists vehicles_zz_probe on public.vehicles;
create trigger vehicles_zz_probe
  before insert on public.vehicles
  for each row execute function public.probe_vehicles_insert();

commit;

-- ===========================================================================
-- NOW: save a vehicle in the app, wait for it to fail, then run:
-- ===========================================================================
select id, seen_at, tg_op, auth_uid, new_user_id, policy_ok, new_id,
       db_session_user, db_current_user
from public.trigger_probe_log
order by id desc
limit 10;

-- ===========================================================================
-- Reading it
--
--   policy_ok = true  AND the app still reported 42501
--       The refusal is NOT the vehicles INSERT policy. Something else is
--       refusing the statement, and the next place to look is the upsert's
--       ON CONFLICT DO UPDATE path rather than the insert.
--
--   policy_ok = false
--       The row reaching the trigger does not satisfy the policy, which means
--       the stamp did not happen for this statement after all, despite the v1
--       probe showing it had.
--
--   No rows at all
--       The insert never reached the table, and nothing in vehicles is
--       responsible.
--
-- ===========================================================================
-- Afterwards, remove it. Do not leave it installed.
-- ===========================================================================
-- begin;
-- drop trigger if exists vehicles_zz_probe on public.vehicles;
-- drop function if exists public.probe_vehicles_insert();
-- drop table if exists public.trigger_probe_log;
-- commit;
