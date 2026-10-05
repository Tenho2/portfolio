-- EV Multi-Tracker: the database decides who owns a row
-- Run this in the Supabase SQL editor AFTER 04-roles.sql and 05-trash.sql.
-- Dashboard -> SQL Editor -> New query -> paste -> Run.
--
-- Everything here is idempotent.
--
-- The problem
--   The app used to send user_id in every write, so a stale or mismatched
--   client-side identity could produce a row the insert policy then refused:
--
--     42501  new row violates row-level security policy for table "vehicles"
--
--   That is RLS working correctly, but the cause was invisible from the client
--   and unfixable there, because the only available "repair" was to resend the
--   same wrong value.
--
-- The fix
--   A BEFORE INSERT trigger sets user_id from auth.uid(), so whatever the client
--   sends is overwritten with the identity the server actually authenticated.
--   The client can no longer get this wrong.
--
--   Only INSERT is stamped, never UPDATE. An upsert of an existing row takes the
--   UPDATE path, so the original author of a charging session is preserved when
--   an owner or admin corrects somebody else's entry. That behaviour is
--   unchanged by this migration.
--
-- Why this does not affect a shared driver
--   A driver logging a session for a shared vehicle is stamped with their own
--   id, which is exactly what the client was already sending. Only logging a
--   session on somebody else's behalf would change, and that is not a feature.

begin;

-- ---------------------------------------------------------------------------
-- 1. The trigger function
--    Deliberately NOT security definer: it only reads auth.uid(), which comes
--    from the request's JWT and needs no elevated rights.
-- ---------------------------------------------------------------------------
create or replace function public.stamp_row_owner()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  -- auth.uid() is null for service_role and for a manual INSERT from this SQL
  -- editor. Overwriting user_id in those cases would wipe the owner of a row
  -- inserted on purpose, so the stamp only applies to a real signed-in user.
  if tg_op = 'INSERT' and auth.uid() is not null then
    new.user_id := auth.uid();
  end if;
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- 2. Attach it
-- ---------------------------------------------------------------------------
drop trigger if exists vehicles_stamp_owner on public.vehicles;
create trigger vehicles_stamp_owner
  before insert on public.vehicles
  for each row execute function public.stamp_row_owner();

drop trigger if exists sessions_stamp_author on public.sessions;
create trigger sessions_stamp_author
  before insert on public.sessions
  for each row execute function public.stamp_row_owner();

-- ---------------------------------------------------------------------------
-- 3. No grants needed
--    A trigger runs with the privileges of the statement that fired it and is
--    not separately executable, so nothing has to be granted.
--
--    The existing policies still apply afterwards and are unchanged:
--      vehicles  "vehicles insertable by owner"  with check (user_id = auth.uid())
--                -> now always satisfied, because the trigger set it from the
--                   same auth.uid() the policy compares against.
--      sessions  "sessions addable by drivers"  with check (can_add_session(...))
--                -> independent of user_id, so this migration does not alter
--                   who may add a session.
--
--    A rejected write can now only mean a genuine permission problem, which is
--    what the sync panel should be reporting.
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- 4. Confirm
-- ---------------------------------------------------------------------------
select tgname, pg_get_triggerdef(oid) as definition
from pg_trigger
where tgrelid in ('public.vehicles'::regclass, 'public.sessions'::regclass)
  and not tgisinternal
order by tgname;

-- Every existing row should be owned by somebody. Rows with a null owner cannot
-- be inserted any more and have to be adopted or deleted by hand.
select 'vehicle' as kind, v.id, v.name as label, v.user_id
from public.vehicles v
where v.user_id is null
union all
select 'session', s.id, s.location, s.user_id
from public.sessions s
where s.user_id is null;

-- ---------------------------------------------------------------------------
-- 5. If that last query returns rows
--    They predate this migration and have no owner, so no policy lets anyone
--    read or write them. Adopt them only if you know which account they belong
--    to; otherwise delete them. Replace <uuid> with the owning account's id,
--    which you can read with: select id, email from auth.users;
--
--    update public.vehicles set user_id = '<uuid>' where user_id is null;
--    update public.sessions set user_id = '<uuid>' where user_id is null;
-- ---------------------------------------------------------------------------

commit;
