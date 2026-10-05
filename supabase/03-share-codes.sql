-- EV Multi-Tracker: shareable vehicle codes
-- Run this in the SQL editor AFTER 01-schema.sql.
-- Everything here is idempotent.
--
-- Why this is needed
--   A 36 character uuid is impossible to read out in a family chat. Each
--   vehicle instead gets a six character code from an alphabet with no
--   0/O/1/I, so it survives being read aloud or retyped. The code lives in its
--   own column and never replaces the uuid, so existing rows keep working.
--
-- Design notes
--   * Codes are allocated by the server, so two vehicles cannot collide.
--   * A code can be rotated. People who already added the vehicle keep their
--     access; only the old code stops working. That is how a code that leaked
--     into a public chat gets withdrawn.
--   * Redeeming uses the caller's own account, so nobody has to type a
--     username and no email address is ever involved.
--   * The code IS the capability. Anyone who has it can add the vehicle.
--     Read the "revocation" note in section 7 before treating that as a bug.

-- ---------------------------------------------------------------------------
-- 1. The column and its uniqueness rule
--    Nullable, so existing rows and client inserts that do not know about it
--    keep working. Uniqueness only applies to codes that exist.
-- ---------------------------------------------------------------------------
alter table public.vehicles
  add column if not exists share_code text;

do $$
begin
  if not exists (
    select 1 from pg_indexes
    where schemaname = 'public'
      and tablename = 'vehicles'
      and indexname = 'vehicles_share_code_key'
  ) then
    create unique index vehicles_share_code_key
      on public.vehicles (upper(share_code))
      where share_code is not null;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 2. Read-only check: what the column looks like right now
-- ---------------------------------------------------------------------------
select count(*) as vehicles,
       count(share_code) as with_code
from public.vehicles;

-- ---------------------------------------------------------------------------
-- 3. Allocate a code that nobody is using
-- ---------------------------------------------------------------------------
create or replace function public.gen_share_code()
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  -- no 0, O, 1 or I, so a code can be read aloud without ambiguity
  alphabet constant text := '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
  code  text;
  tries integer := 0;
begin
  loop
    code := '';
    for i in 1..6 loop
      code := code || substr(alphabet, 1 + floor(random() * length(alphabet))::int, 1);
    end loop;
    tries := tries + 1;
    exit when not exists (
      select 1 from public.vehicles v where upper(v.share_code) = upper(code)
    );
    if tries > 30 then
      raise exception 'could not allocate a share code'
        using errcode = 'P0001';
    end if;
  end loop;
  return code;
end;
$$;

-- ---------------------------------------------------------------------------
-- 4. The owner's code for a vehicle, created on first request
-- ---------------------------------------------------------------------------
create or replace function public.ensure_share_code(p_vehicle uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v public.vehicles;
begin
  select * into v
  from public.vehicles
  where id = p_vehicle and user_id = auth.uid();

  if not found then
    raise exception 'vehicle does not belong to this user'
      using errcode = 'P0001';
  end if;

  if v.share_code is null then
    update public.vehicles
    set share_code = public.gen_share_code()
    where id = p_vehicle
    returning share_code into v.share_code;
  end if;

  return v.share_code;
end;
$$;

-- ---------------------------------------------------------------------------
-- 5. Replace the code, keeping everyone who already added the vehicle
-- ---------------------------------------------------------------------------
create or replace function public.rotate_share_code(p_vehicle uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v public.vehicles;
begin
  select * into v
  from public.vehicles
  where id = p_vehicle and user_id = auth.uid();

  if not found then
    raise exception 'vehicle does not belong to this user'
      using errcode = 'P0001';
  end if;

  update public.vehicles
  set share_code = public.gen_share_code()
  where id = p_vehicle
  returning share_code into v.share_code;

  return v.share_code;
end;
$$;

-- ---------------------------------------------------------------------------
-- 6. Add a shared vehicle with a code
--    Returns a status and, on success, the vehicle row so the app can show it
--    straight away. A bad code returns a status rather than raising, because a
--    typo is the normal case and the user needs a readable answer.
-- ---------------------------------------------------------------------------
create or replace function public.redeem_share_code(p_code text)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  me uuid := auth.uid();
  want text := upper(trim(coalesce(p_code, '')));
  v public.vehicles;
  added integer := 0;
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
    return json_build_object(
      'status', 'own-vehicle',
      'vehicleId', v.id,
      'name', v.name
    );
  end if;

  insert into public.vehicle_shares (vehicle_id, user_id, role, invited_by)
  values (v.id, me, 'driver', v.user_id)
  on conflict (vehicle_id, user_id) do nothing;

  get diagnostics added = row_count;
  /* row_count is 0 when the row already existed. That is still a success from
     the user's point of view, so it is reported as ok with already = true. */

  return json_build_object(
    'status', 'ok',
    'already', (added = 0),
    'vehicleId', v.id,
    'name', v.name,
    'icon', v.icon,
    'initial_odometer', v.initial_odometer,
    'user_id', v.user_id
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- 7. Grant execute to the roles the app authenticates as.
--    These functions are security definer, so they bypass RLS on purpose.
--    Each one checks auth.uid() itself, so a caller can only ever reach the
--    vehicle it owns or a vehicle it chose the code for.
-- ---------------------------------------------------------------------------
grant execute on function public.gen_share_code() to anon, authenticated;
grant execute on function public.ensure_share_code(uuid) to anon, authenticated;
grant execute on function public.rotate_share_code(uuid) to anon, authenticated;
grant execute on function public.redeem_share_code(text) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- 8. Note on revoking access
--    Rotating the code stops new people using it, but it does NOT undo it for
--    somebody who already read it: while their share row exists they can keep
--    passing the old code to others. If that matters for your use, remove the
--    "insert into public.vehicle_shares" statement in section 6 and replace it
--    with a return of json_build_object('status', 'needs-invite'). The code
--    then only works for accounts the owner has already invited by username,
--    which makes a revocation final at the cost of the code no longer being
--    self-service.
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- 9. Confirm
-- ---------------------------------------------------------------------------
select proname, pg_get_function_result(oid) as returns
from pg_proc
where pronamespace = 'public'::regnamespace
  and proname in ('gen_share_code', 'ensure_share_code', 'rotate_share_code', 'redeem_share_code')
order by proname;

select indexname, indexdef
from pg_indexes
where schemaname = 'public'
  and tablename = 'vehicles'
  and indexname like '%share_code%';