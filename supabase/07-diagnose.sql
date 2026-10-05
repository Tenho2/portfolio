-- EV Multi-Tracker: read-only diagnosis for "42501 new row violates row-level
-- security policy for table vehicles".
--
-- It changes nothing: no DDL, no DML, no grants. Only SELECTs. Safe to run as
-- often as you like.
--
-- RUN THESE ONE AT A TIME
--   The Supabase SQL editor returns the result of the LAST statement in a
--   pasted script and nothing else. Pasting this whole file therefore shows you
--   only the final query, which is how several rounds of diagnosis went nowhere.
--   Select one statement, run it, read it, then run the next.
--
--   If you only want the four that decide it, run these in order:
--     section 0a  any RESTRICTIVE policy          (usually the whole answer)
--     section 0b  the live body of stamp_row_owner
--     section 3    vehicles with user_id IS NULL   (the usual answer)
--     section 5    vehicle_role() per vehicle      (confirms it per row)
--
-- Why this exists
--   A 42501 on the vehicles table has four possible causes, and they look
--   identical from the browser:
--
--     1. The session is dead, so auth.uid() is NULL.
--     2. The stamp trigger from 06 is missing, or its function body is not the
--        one this repository ships, so user_id is whatever the client sent.
--     3. The row already exists with user_id IS NULL. It came from before the
--        policies were tightened, or from the Table Editor, where auth.uid() is
--        NULL so the trigger deliberately declines to stamp it.
--     4. A RESTRICTIVE policy sits over the permissive ones. Permissive
--        policies are ORed, so extras widen access; restrictive ones are ANDed,
--        so a single one refuses everything no matter how well the stamp worked.
--
--   Case 3 is the one that looks impossible and is not: "vehicles editable by
--   owner or admin" resolves through vehicle_role, whose first branch is
--   `v.user_id = auth.uid()`. With user_id NULL that comparison is NULL rather
--   than true, the role falls through to NULL, rank is 0, and the server refuses
--   the row to the account that owns it. The SELECT policy refuses it too, so
--   the app never receives it and cannot show it.
--
--   06-owner-stamp.sql cannot repair case 3, because its trigger is BEFORE
--   INSERT only. A row that already exists takes the UPDATE path, is never
--   stamped, and stays unwritable for good.
--
-- The queries below tell the three apart.

-- ===========================================================================
-- 0. THE TWO THINGS THAT MATTER MOST. Run these first and paste them even if
--    you skip everything below.
-- ===========================================================================

-- 0a. Any policy that is RESTRICTIVE.
--
--     Permissive policies are ORed together: a row is allowed if ANY of them
--     passes. RESTRICTIVE policies are ANDed: if even ONE fails, the write is
--     refused no matter how many permissive ones pass.
--
--     So a single restrictive INSERT policy on vehicles defeats everything
--     04-roles.sql created, including the policy the stamp trigger satisfies.
--     This is the one schema state that produces a 42501 for a row the
--     database itself stamped with the caller's own id.
--
--     Expect zero rows.
select policyname, tablename, cmd, permissive,
       coalesce(qual, '(none)')      as using_expression,
       coalesce(with_check, '(none)') as check_expression
from pg_policies
where schemaname = 'public'
  and tablename in ('vehicles', 'sessions', 'vehicle_shares')
  and permissive = 'RESTRICTIVE'
order by tablename, cmd, policyname;

-- 0b. The live body of the stamp function.
--
--     The trigger existing is not the same as the trigger stamping. If an older
--     copy of 06-owner-stamp.sql was run first, create or replace function has
--     left a body that does something else, and every INSERT keeps whatever
--     user_id the client sent.
--
--     Expect: if tg_op = 'INSERT' and auth.uid() is not null then new.user_id := auth.uid()
--
--     The empty parentheses are required. A regprocedure cast carries the
--     argument list, so 'public.stamp_row_owner()'::regprocedure is a syntax
--     error for a function that takes none.
select pg_get_functiondef('public.stamp_row_owner()'::regprocedure) as body;

-- ===========================================================================
-- 1. Is the stamp trigger actually installed?
--    Expect two rows: sessions_stamp_author and vehicles_stamp_owner.
--    If vehicles_stamp_owner is MISSING, that is cause 2: re-run
--    06-owner-stamp.sql.
-- ===========================================================================
select tgname,
       tgrelid::regclass as table_name,
       pg_get_triggerdef(oid) as definition
from pg_trigger
where tgrelid in ('public.vehicles'::regclass, 'public.sessions'::regclass)
  and not tgisinternal
order by tgname;

-- ===========================================================================
-- 2. Which policies are actually in force on vehicles?
--    Expect exactly four, all from 04-roles.sql:
--      vehicles readable by members            (select)
--      vehicles insertable by owner            (insert)
--      vehicles editable by owner or admin     (update)
--      vehicles removable by owner             (delete)
--
--    Anything extra is a leftover. Postgres ORs permissive policies together,
--    so a stray FOR ALL policy can grant or refuse in ways the four above do
--    not describe. Compare qual and with_check against the migration.
-- ===========================================================================
select policyname,
       cmd,
       permissive,
       roles,
       coalesce(qual, '(none)')      as using_expression,
       coalesce(with_check, '(none)') as check_expression
from pg_policies
where schemaname = 'public'
  and tablename = 'vehicles'
order by cmd, policyname;

-- ===========================================================================
-- 3. Cause 3: rows with no owner.
--    THIS IS THE USUAL ANSWER. Expect zero rows.
--
--    Each row returned here is a vehicle the server cannot attribute to any
--    account. It cannot be read, renamed, or written by anybody, including
--    whoever actually created it. The app cannot show it either, because the
--    SELECT policy refuses it, so it is invisible on every device while still
--    blocking writes to the id the app is holding.
-- ===========================================================================
select v.id,
       v.name,
       v.user_id,
       v.deleted_at,
       v.created_at
from public.vehicles v
where v.user_id is null
order by v.created_at;

-- Same for sessions, since the same trigger stamps them.
select s.id, s.vehicle_id, s.location, s.date, s.user_id
from public.sessions s
where s.user_id is null
order by s.date desc
limit 20;

-- ===========================================================================
-- 4. What the server thinks each vehicle is, from the database's own point of
--    view. Replaces guessing from the app.
--
--    owner_user_id should equal the account you are signed in as on the phone.
--    Find that id with: select id, email from auth.users;
--
--    A row whose owner_user_id is null is cause 3. A row whose owner_user_id is
--    some other uuid is a genuinely foreign row, which is the only case that
--    really does mean "not yours".
-- ===========================================================================
select v.id,
       v.name,
       v.user_id as owner_user_id,
       v.deleted_at,
       (v.user_id = (select id from auth.users limit 1)) as note_wrong_account
from public.vehicles v
order by v.created_at;

-- ===========================================================================
-- 5. Ownership as the RLS helper functions see it, per vehicle.
--    role_for_me should read 'owner' for your own vehicles. Anything else, or
--    null, is exactly what the policy evaluates and exactly why a write is
--    refused.
-- ===========================================================================
select v.id,
       v.name,
       v.user_id,
       public.vehicle_role(v.id) as role_for_me,
       public.vehicle_rank(v.id) as rank_for_me,
       public.can_view_vehicle(v.id) as may_read,
       public.can_edit_vehicle(v.id) as may_edit
from public.vehicles v
order by v.created_at;

-- ===========================================================================
-- 6. Is RLS even switched on? A table with RLS disabled silently ignores every
--    policy, which would be the opposite problem but worth ruling out.
-- ===========================================================================
select relname,
       relrowsecurity as rls_enabled,
       relforcerowsecurity as rls_forced
from pg_class
where oid = 'public.vehicles'::regclass;

-- ===========================================================================
-- Reading the results
--
--   Query 1 missing vehicles_stamp_owner  -> re-run 06-owner-stamp.sql
--   Query 3 returns rows                  -> cause 3, the usual answer
--   Query 5 shows role_for_me null        -> cause 3, confirmed per row
--   Query 2 shows a policy you do not
--     recognise                            -> a migration was skipped
--   All four look right and it still fails
--                                             -> paste this output and the
--                                                browser console lines; that
--                                                would point at the request
--                                                rather than the schema
--
-- Do not "fix" a cause-3 row with a blanket update yet. Paste the output first:
-- adopting a row needs the right account id, and guessing it would attach
-- somebody's car to the wrong person.