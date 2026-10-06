-- EV Multi-Tracker: sharing roles and owner approval
-- Run this in the Supabase SQL editor AFTER 01-schema.sql and
-- 03-share-codes.sql, both of which are in this folder. The order matters:
-- this one replaces the policies they created.
-- Dashboard -> SQL Editor -> New query -> paste -> Run.
--
-- There is no 02. It used to hold a sessions trigger and four policies, and
-- every one of them is recreated below, so it was removed rather than kept as
-- a file that taught the reader something untrue. The numbering gap is
-- deliberate; the files are not renumbered because they cross-reference each
-- other by number in their headers.
--
-- Everything here is idempotent: re-running it is safe and changes nothing
-- beyond making sure the final state matches the intent below.
--
-- What it changes
--   1. vehicle_shares gains a `status` column, so redeeming a code creates a
--      PENDING request instead of granting access straight away.
--   2. `role` widens from ('owner','driver') to ('viewer','driver','admin').
--   3. Access is decided by a rank, and every policy and trigger is rewritten
--      to use it, so permissions are enforced by the database rather than by
--      the client.
--   4. The owner gets two new functions to accept/reject a request and to
--      change or revoke a role.
--
-- Role ladder, lowest to highest
--   viewer   read the vehicle, its history and the dashboard totals
--   driver   everything a viewer can do, plus add sessions and edit/delete
--            ONLY the sessions they logged themselves
--   admin    edit or delete ANY session, and change vehicle settings
--   owner    everything, and the only role that can delete the vehicle or
--            manage the share list
--
-- Ownership itself is still vehicles.user_id. A share row never holds the
-- owner, so the owner cannot accidentally demote or revoke themselves.

begin;

-- ---------------------------------------------------------------------------
-- 1. Columns
-- ---------------------------------------------------------------------------
-- The defaults are the SAFE ones: a row that appears by any route nobody
-- thought about is pending and read-only. Both RPCs below pass explicit
-- values, so the normal paths are unaffected.

alter table public.vehicle_shares
  add column if not exists status text not null default 'pending',
  add column if not exists decided_at timestamptz,
  add column if not exists decided_by uuid references auth.users(id) on delete set null;

-- Existing shares were granted deliberately, so they stay granted.
update public.vehicle_shares
   set status = 'accepted',
       decided_at = coalesce(decided_at, created_at)
 where status is distinct from 'accepted'
   and decided_at is null;

-- The old column default was 'driver', which would hand out write access to
-- any future insert that forgot to choose a role.
alter table public.vehicle_shares
  alter column role set default 'viewer';

-- 'owner' was allowed by the old check but never written by the app; the
-- closest real meaning is 'admin', so that is what it becomes.
update public.vehicle_shares set role = 'admin' where role = 'owner';

-- The check constraints were created inline and so have generated names. Drop
-- whichever check constraints exist on those columns and add one named
-- explicitly for each, so this file can be re-run without tripping over itself.
--
-- The status constraint has to be swept up too, and matching on the word "role"
-- would miss it: its definition is check (status in ('pending', 'accepted',
-- 'rejected')), which never mentions role. That is what made this file fail on
-- a second run with
--   42710 constraint "vehicle_shares_status_check" already exists
-- while the role constraint dropped and re-added cleanly. Named constraints are
-- dropped by name first, then anything left over that guards either column.
alter table public.vehicle_shares
  drop constraint if exists vehicle_shares_role_check;
alter table public.vehicle_shares
  drop constraint if exists vehicle_shares_status_check;

do $$
declare
  c record;
begin
  for c in
    select conname
    from pg_constraint
    where conrelid = 'public.vehicle_shares'::regclass
      and contype  = 'c'
      and ( pg_get_constraintdef(oid) ilike '%role%'
         or pg_get_constraintdef(oid) ilike '%status%' )
  loop
    execute format('alter table public.vehicle_shares drop constraint %I', c.conname);
  end loop;
end $$;

alter table public.vehicle_shares
  add constraint vehicle_shares_role_check
  check (role in ('viewer', 'driver', 'admin'));

alter table public.vehicle_shares
  add constraint vehicle_shares_status_check
  check (status in ('pending', 'accepted', 'rejected'));

-- The owner panel lists pending requests for one vehicle.
create index if not exists vehicle_shares_status_idx
  on public.vehicle_shares (vehicle_id, status);

-- ---------------------------------------------------------------------------
-- 2. Rank helpers
--    All of them are SECURITY DEFINER so the vehicle_shares read inside them
--    is not itself filtered by the policies in section 4. Without that, the
--    policies would recurse.
-- ---------------------------------------------------------------------------

-- 'owner' | 'admin' | 'driver' | 'viewer' | null.
-- A pending or rejected share returns null, which is what makes approval
-- actually mean something: until the owner accepts, the requester resolves to
-- no role at all.
create or replace function public.vehicle_role(p_vehicle uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select case
           when v.user_id = auth.uid() then 'owner'
           when s.status = 'accepted'  then s.role
           else null
         end
  from public.vehicles v
  left join public.vehicle_shares s
    on s.vehicle_id = v.id
   and s.user_id    = auth.uid()
  where v.id = p_vehicle;
$$;

-- owner 4, admin 3, driver 2, viewer 1, nothing 0.
create or replace function public.vehicle_rank(p_vehicle uuid)
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select case public.vehicle_role(p_vehicle)
           when 'owner'  then 4
           when 'admin'  then 3
           when 'driver' then 2
           when 'viewer' then 1
           else 0
         end;
$$;

-- Read access. This is the gate for every SELECT policy.
create or replace function public.can_view_vehicle(p_vehicle uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.vehicle_rank(p_vehicle) >= 1;
$$;

-- Add a charging session.
create or replace function public.can_add_session(p_vehicle uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.vehicle_rank(p_vehicle) >= 2;
$$;

-- Change vehicle settings: name, icon, odometer baseline.
create or replace function public.can_edit_vehicle(p_vehicle uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.vehicle_rank(p_vehicle) >= 3;
$$;

-- Change or remove a session. Admins and the owner may touch anyone's;
-- a driver only their own.
create or replace function public.can_edit_session(p_vehicle uuid, p_author uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.vehicle_rank(p_vehicle) >= 3
      or (public.vehicle_rank(p_vehicle) >= 2 and p_author = auth.uid());
$$;

-- Kept because the existing sessions trigger calls it by name. It now means
-- "may read", not "may write".
create or replace function public.can_access_vehicle(p_vehicle uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.can_view_vehicle(p_vehicle);
$$;

-- ---------------------------------------------------------------------------
-- 3. Rebuild the policies
--    Every policy on these three tables is dropped first, then a known set is
--    created. That is deliberate. A live database turned out to carry policies
--    named "vehicles own select", "vehicles own insert" and half a dozen more
--    that appear in no file in this repository at all: they came from the
--    original hand-built schema, before these migrations existed, so no
--    `drop policy` ever named them. Because Postgres ORs permissive policies
--    together, extras grant access past the new rules; and because restrictive
--    policies are ANDed, a single leftover one refuses every write no matter
--    how correct the new rules are.
--
--    Sweeping by catalogue rather than by name is what makes that impossible.
-- ---------------------------------------------------------------------------
do $$
declare
  p record;
begin
  for p in
    select policyname, tablename
    from pg_policies
    where schemaname = 'public'
      and tablename in ('vehicles', 'sessions', 'vehicle_shares')
  loop
    execute format('drop policy if exists %I on public.%I', p.policyname, p.tablename);
  end loop;
end $$;

alter table public.vehicles       enable row level security;
alter table public.sessions       enable row level security;
alter table public.vehicle_shares enable row level security;

-- vehicles ------------------------------------------------------------------
create policy "vehicles readable by members"
  on public.vehicles for select
  using (public.can_view_vehicle(id));

create policy "vehicles insertable by owner"
  on public.vehicles for insert
  with check (user_id = auth.uid());

-- owner and admin. Ownership itself is immutable, enforced by the
-- vehicles_owner_immutable trigger below rather than by this policy.
--
-- It used to be pinned here, as `with check (can_edit_vehicle(id) and user_id =
-- auth.uid())`, which looked like it said "an admin may not change the owner" but
-- did not. A with check expression only ever sees the NEW row, so there is no
-- way to compare it against the old owner in a policy. Comparing the new row's
-- user_id with auth.uid() instead says "only the owner may write this row at
-- all" - and since an admin updating somebody else's vehicle correctly leaves
-- user_id as the owner's, every single admin edit was refused with 42501. The
-- admin rank was silently inert: it could read the vehicle and clear its history
-- but never rename it or correct its odometer baseline.
--
-- That failure was nasty rather than obvious. The UI mirrors this policy
-- (canEditVehicle is rank >= 3), so the rename sheet opened, saved, showed the
-- new name, and the server refused three times - after which the sync panel
-- offered to DISCARD that vehicle and all of its sessions from the device.
create policy "vehicles editable by owner or admin"
  on public.vehicles for update
  using      (public.can_edit_vehicle(id))
  with check (public.can_edit_vehicle(id));

-- Deleting the car itself stays owner-only. An admin can clear the history but
-- cannot remove the vehicle.
create policy "vehicles removable by owner"
  on public.vehicles for delete
  using (user_id = auth.uid());

-- sessions ------------------------------------------------------------------
create policy "sessions readable by members"
  on public.sessions for select
  using (public.can_view_vehicle(vehicle_id));

create policy "sessions addable by drivers"
  on public.sessions for insert
  with check (public.can_add_session(vehicle_id));

create policy "sessions editable by author or admin"
  on public.sessions for update
  using      (public.can_edit_session(vehicle_id, user_id))
  with check (public.can_edit_session(vehicle_id, user_id));

create policy "sessions removable by author or admin"
  on public.sessions for delete
  using (public.can_edit_session(vehicle_id, user_id));

-- vehicle_shares ------------------------------------------------------------
-- A member sees their own row. The owner sees every row for their car, which is
-- what the Pending Requests list reads.
create policy "shares readable by members"
  on public.vehicle_shares for select
  using (
    user_id = auth.uid()
    or exists (
      select 1 from public.vehicles v
      where v.id = vehicle_shares.vehicle_id and v.user_id = auth.uid()
    )
  );

-- Only the owner may change the list. This is also what stops a driver
-- promoting themselves to admin with a direct UPDATE.
create policy "shares insertable by owner"
  on public.vehicle_shares for insert
  with check (
    exists (
      select 1 from public.vehicles v
      where v.id = vehicle_shares.vehicle_id and v.user_id = auth.uid()
    )
  );

create policy "shares editable by owner"
  on public.vehicle_shares for update
  using (
    exists (
      select 1 from public.vehicles v
      where v.id = vehicle_shares.vehicle_id and v.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.vehicles v
      where v.id = vehicle_shares.vehicle_id and v.user_id = auth.uid()
    )
  );

create policy "shares removable by owner"
  on public.vehicle_shares for delete
  using (
    exists (
      select 1 from public.vehicles v
      where v.id = vehicle_shares.vehicle_id and v.user_id = auth.uid()
    )
  );

-- ---------------------------------------------------------------------------
-- 4. The sessions ownership trigger
--    RLS does not fire for the statement owner, and the old check accepted any
--    reader. It now asks the same questions the policies ask.
-- ---------------------------------------------------------------------------
create or replace function public.sessions_vehicle_belongs_to_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    if not public.can_add_session(new.vehicle_id) then
      raise exception 'you do not have permission to add sessions to this vehicle'
        using errcode = 'P0001';
    end if;
  elsif not public.can_edit_session(new.vehicle_id, coalesce(new.user_id, auth.uid())) then
    raise exception 'you do not have permission to change this session'
      using errcode = 'P0001';
  end if;
  return new;
end;
$$;

drop trigger if exists sessions_vehicle_owner_check on public.sessions;
create trigger sessions_vehicle_owner_check
  before insert or update on public.sessions
  for each row execute function public.sessions_vehicle_belongs_to_user();

-- ---------------------------------------------------------------------------
-- 4b. The vehicle ownership trigger
--     This is what the vehicles update policy used to try to do, and could not.
--     A RLS `with check` sees only the new row; a BEFORE UPDATE trigger sees both,
--     which is the only place the old owner is still readable.
--
--     Deliberately NOT security definer: it compares two columns of the row being
--     changed and raises, touching no other table, so it needs no elevated rights.
--     The 42501 code is deliberate too - the client already classifies 42501 as a
--     permission problem, so handing the vehicle to somebody else reads as the
--     refusal it is rather than as an unexplained failure.
-- ---------------------------------------------------------------------------
create or replace function public.vehicles_owner_is_immutable()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.user_id is distinct from old.user_id then
    raise exception 'the owner of a vehicle cannot be changed'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists vehicles_owner_immutable on public.vehicles;
create trigger vehicles_owner_immutable
  before update on public.vehicles
  for each row execute function public.vehicles_owner_is_immutable();

-- ---------------------------------------------------------------------------
-- 5. Owner-initiated invite: grants immediately, with a chosen role.
--    The old two-argument version is dropped first, because adding a parameter
--    with a default would otherwise leave two overloads and an ambiguous call.
-- ---------------------------------------------------------------------------
drop function if exists public.invite_driver(uuid, text);

create or replace function public.invite_driver(
  p_vehicle  uuid,
  p_username text,
  p_role     text default 'driver'
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  target uuid;
  want   text := lower(trim(p_username));
begin
  if want = '' then
    return 'no-such-user';
  end if;

  if coalesce(p_role, '') not in ('viewer', 'driver', 'admin') then
    return 'bad-role';
  end if;

  if not exists (
    select 1 from public.vehicles v
    where v.id = p_vehicle and v.user_id = auth.uid()
  ) then
    return 'not-owner';
  end if;

  select u.id into target
  from auth.users u
  where lower(split_part(u.email, '@', 1)) = want
     or lower(u.email) = want
  order by (lower(split_part(u.email, '@', 1)) = want) desc nulls last
  limit 1;

  if target is null then
    return 'no-such-user';
  end if;
  if target = auth.uid() then
    return 'self';
  end if;

  -- The owner asked for this person by name, so it is accepted outright.
  insert into public.vehicle_shares
    (vehicle_id, user_id, role, status, invited_by, decided_by, decided_at)
  values
    (p_vehicle, target, p_role, 'accepted', auth.uid(), auth.uid(), now())
  on conflict (vehicle_id, user_id) do update
    set role       = excluded.role,
        status     = 'accepted',
        decided_by = auth.uid(),
        decided_at = now();

  return 'ok';
end;
$$;

-- ---------------------------------------------------------------------------
-- 6. Redeeming a code now creates a REQUEST.
--    The response carries the vehicle name and icon so the app can show a
--    pending entry straight away, but the caller resolves to no role until the
--    owner accepts, so no policy will let them read the history yet.
-- ---------------------------------------------------------------------------
create or replace function public.redeem_share_code(p_code text)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  me      uuid := auth.uid();
  want    text := upper(trim(coalesce(p_code, '')));
  v       public.vehicles;
  prev    text;
begin
  if me is null then
    return json_build_object('status', 'signed-out');
  end if;
  if want = '' then
    return json_build_object('status', 'empty');
  end if;

  select * into v
  from public.vehicles
  where share_code is not null and upper(share_code) = want;

  if not found then
    return json_build_object('status', 'no-such-code');
  end if;

  if v.user_id = me then
    return json_build_object('status', 'own-vehicle', 'vehicleId', v.id, 'name', v.name);
  end if;

  select s.status into prev
  from public.vehicle_shares s
  where s.vehicle_id = v.id and s.user_id = me;

  if prev = 'accepted' then
    -- Already a member. Re-entering the code must not quietly downgrade them.
    return json_build_object(
      'status', 'already-member',
      'vehicleId', v.id,
      'name', v.name
    );
  end if;

  if prev = 'pending' then
    return json_build_object(
      'status', 'already-pending',
      'vehicleId', v.id,
      'name', v.name
    );
  end if;

  -- New, or a previous request that was rejected and is being retried.
  insert into public.vehicle_shares
    (vehicle_id, user_id, role, status, invited_by, decided_at)
  values
    (v.id, me, 'viewer', 'pending', v.user_id, null)
  on conflict (vehicle_id, user_id) do update
    set status     = 'pending',
        role       = 'viewer',
        decided_by = null,
        decided_at = null;

  return json_build_object(
    'status', 'pending',
    'vehicleId', v.id,
    'name', v.name,
    'icon', v.icon,
    'initial_odometer', v.initial_odometer,
    'user_id', v.user_id
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- 7. Approval and role management. Owner only, enforced inside the function as
--    well as by the policy, so the check does not depend on the caller taking
--    a particular code path.
-- ---------------------------------------------------------------------------
create or replace function public.set_share_status(
  p_vehicle uuid,
  p_user    uuid,
  p_status  text
)
returns text
language plpgsql
security definer
set search_path = public
as $$
begin
  if coalesce(p_status, '') not in ('accepted', 'rejected') then
    return 'bad-status';
  end if;

  if not exists (
    select 1 from public.vehicles v
    where v.id = p_vehicle and v.user_id = auth.uid()
  ) then
    return 'not-owner';
  end if;

  if not exists (
    select 1 from public.vehicle_shares s
    where s.vehicle_id = p_vehicle and s.user_id = p_user
  ) then
    return 'no-such-share';
  end if;

  update public.vehicle_shares
     set status     = p_status,
         decided_by = auth.uid(),
         decided_at = now()
   where vehicle_id = p_vehicle and user_id = p_user;

  return 'ok';
end;
$$;

create or replace function public.set_share_role(
  p_vehicle uuid,
  p_user    uuid,
  p_role    text
)
returns text
language plpgsql
security definer
set search_path = public
as $$
begin
  if coalesce(p_role, '') not in ('viewer', 'driver', 'admin') then
    return 'bad-role';
  end if;

  if not exists (
    select 1 from public.vehicles v
    where v.id = p_vehicle and v.user_id = auth.uid()
  ) then
    return 'not-owner';
  end if;

  -- Changing a role implies membership, so a rejected row becomes accepted.
  update public.vehicle_shares
     set role       = p_role,
         status     = 'accepted',
         decided_by = auth.uid(),
         decided_at = now()
   where vehicle_id = p_vehicle and user_id = p_user;

  if not found then
    return 'no-such-share';
  end if;

  return 'ok';
end;
$$;

-- ---------------------------------------------------------------------------
-- 8. Grants.
--    The app only ever calls these signed in, so anon loses execute on all of
--    them. Each function checks auth.uid() internally, so this is a second
--    layer rather than the only one.
-- ---------------------------------------------------------------------------
revoke execute on function public.gen_share_code()                       from anon;
revoke execute on function public.ensure_share_code(uuid)                from anon;
revoke execute on function public.rotate_share_code(uuid)                from anon;
revoke execute on function public.redeem_share_code(text)                from anon;
revoke execute on function public.invite_driver(uuid, text, text)        from anon;
revoke execute on function public.set_share_status(uuid, uuid, text)     from anon;
revoke execute on function public.set_share_role(uuid, uuid, text)       from anon;

grant execute on function public.gen_share_code()                    to authenticated;
grant execute on function public.ensure_share_code(uuid)             to authenticated;
grant execute on function public.rotate_share_code(uuid)             to authenticated;
grant execute on function public.redeem_share_code(text)             to authenticated;
grant execute on function public.invite_driver(uuid, text, text)     to authenticated;
grant execute on function public.set_share_status(uuid, uuid, text)  to authenticated;
grant execute on function public.set_share_role(uuid, uuid, text)    to authenticated;

-- The rank helpers back the policies, so every role that can read a table
-- needs to run them.
grant execute on function public.vehicle_role(uuid)                to anon, authenticated;
grant execute on function public.vehicle_rank(uuid)                to anon, authenticated;
grant execute on function public.can_view_vehicle(uuid)            to anon, authenticated;
grant execute on function public.can_add_session(uuid)             to anon, authenticated;
grant execute on function public.can_edit_vehicle(uuid)            to anon, authenticated;
grant execute on function public.can_edit_session(uuid, uuid)      to anon, authenticated;
grant execute on function public.can_access_vehicle(uuid)          to anon, authenticated;

-- ---------------------------------------------------------------------------
-- 9. Confirm it worked
-- ---------------------------------------------------------------------------
select column_name, data_type, column_default
from information_schema.columns
where table_schema = 'public'
  and table_name   = 'vehicle_shares'
  and column_name in ('role', 'status', 'decided_at', 'decided_by')
order by column_name;

select policyname, tablename, cmd
from pg_policies
where schemaname = 'public'
  and tablename in ('vehicles', 'sessions', 'vehicle_shares')
order by tablename, cmd, policyname;

-- Anything still pending after this migration would be a request nobody
-- approved. Expect zero rows on an install that was only ever used by its owner.
select vehicle_id, user_id, role, status
from public.vehicle_shares
where status <> 'accepted';

commit;

-- ---------------------------------------------------------------------------
-- 10. What the client has to match
--     The app still speaks the old vocabulary in two places, so run the app
--     changes below together with this migration:
--
--       invite_driver   gains a third argument, p_role
--       redeem_share_code returns 'pending' / 'already-member' / 'already-pending'
--                       instead of 'ok', and no longer grants access
--
--     New: set_share_status(p_vehicle, p_user, p_status) for Accept and Reject,
--     set_share_role(p_vehicle, p_user, p_role) for changing a role.
--
--     Because a pending member has no read access, the app must show them a
--     placeholder car and must not send them to the history or settings views.
-- ---------------------------------------------------------------------------