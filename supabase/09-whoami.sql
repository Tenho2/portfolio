-- EV Multi-Tracker: an identity probe for authenticated requests.
--
-- Run this in the Supabase SQL editor. Idempotent.
--
-- Why this exists
--   A vehicle insert is refused with
--
--     42501  new row violates row-level security policy for table "vehicles"
--
--   The only INSERT policy on that table is
--
--     with check (user_id = auth.uid())
--
--   and 06-owner-stamp.sql puts a BEFORE INSERT trigger on it that sets
--   user_id := auth.uid(). A BEFORE trigger runs before WITH CHECK is evaluated,
--   so if that trigger fires, the policy is satisfied by construction and the
--   insert cannot fail. Every other explanation has been ruled out: the trigger
--   is attached, its body is correct, there is no second INSERT policy, there is
--   no RESTRICTIVE policy, no row has a null owner, and the client's row carries
--   the correct owner id.
--
--   That leaves exactly one possibility: auth.uid() is NULL when the request
--   arrives, meaning the browser sent the request with only the anon key and no
--   Authorization header. auth.role() distinguishes the two directly:
--
--     'anon'         the request carried no user token. A client bug.
--     'authenticated' the token arrived. Then the schema is not what we think.
--
--   The function below is read-only and returns nothing but who the database
--   thinks the caller is. It leaks no data: a caller can only ever learn their
--   own identity, which they already know.

begin;

-- ---------------------------------------------------------------------------
-- 1. The probe
--
--    Deliberately touches nothing but auth.uid() and auth.role(), which are
--    guaranteed to exist. An earlier draft also read auth.users.active, which
--    does not exist in Supabase's auth schema and failed with 42703. A
--    diagnostic must not depend on a column it does not control, and it does
--    not need to: uid comes from the request's own verified token, so a
--    non-null uid already proves the caller has a real user row.
-- ---------------------------------------------------------------------------
create or replace function public.whoami()
returns table (
  uid       uuid,
  role_name text,
  db_user   text
)
language sql
stable
security invoker
set search_path = public
as $$
  select auth.uid(), auth.role(), current_user;
$$;

-- ---------------------------------------------------------------------------
-- 2. Permitted to authenticated only, and deliberately not to anon.
--    An anonymous caller must not be able to use this to confirm that the
--    function exists, and it has nothing useful to tell them anyway.
-- ---------------------------------------------------------------------------
revoke execute on function public.whoami() from anon;
grant execute on function public.whoami() to authenticated;

-- ---------------------------------------------------------------------------
-- 3. Confirm it works, and read the answer correctly.
--
--    This call is made by the SQL editor, which is not a signed-in user, so it
--    WILL return uid = NULL and role_name = 'anon'. That is expected and proves
--    nothing either way. The reading that matters comes from the app, which
--    calls this while signed in. Compare the two:
--
--      editor  -> anon        (expected, ignore)
--      app     -> ???         (this is the answer)
--
--    If the app also reports anon, the browser is not attaching the session and
--    the fix is client-side. If the app reports authenticated, the token is fine
--    and the schema on the live project differs from the migrations here.
--
--    The three columns are all that is returned. db_user is current_user, which
--    on Supabase is 'authenticated' for a signed-in request and 'anon' for an
--    unauthenticated one. It is included only because it is free and sometimes
--    differs from auth.role() in ways that matter.
-- ---------------------------------------------------------------------------
select * from public.whoami();

-- Also re-confirm the trigger is still attached, because 04-roles.sql was
-- re-run after 06 and it is worth proving the trigger survived that.
select tgname,
       tgrelid::regclass as table_name,
       tgenabled,
       pg_get_triggerdef(oid) as definition
from pg_trigger
where tgrelid in ('public.vehicles'::regclass, 'public.sessions'::regclass)
  and not tgisinternal
order by tgname;

-- tgenabled must read 'O' (origin, the default). If it reads 'D' the trigger
-- was disabled rather than dropped, which is invisible to every check so far
-- and would produce exactly this failure with the trigger still listed.

-- And the live text of the one policy that matters, which no query so far has
-- actually shown:
select policyname, cmd, permissive, roles,
       coalesce(qual, '(none)')       as using_expression,
       coalesce(with_check, '(none)') as check_expression
from pg_policies
where schemaname = 'public'
  and tablename = 'vehicles'
  and cmd = 'insert';

-- Expect one row, permissive 'PERMISSIVE', with_check (user_id = auth.uid()).
-- Anything else means the live schema is not what 04-roles.sql writes, and that
-- would explain every refusal without involving the client at all.

commit;
