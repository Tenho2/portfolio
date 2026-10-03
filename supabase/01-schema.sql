-- EV Multi-Tracker: shared vehicles (multiple drivers, one car)
-- Run this ONCE in the Supabase SQL editor: Dashboard -> SQL Editor -> New query.
-- The anon key in the app cannot create tables or policies, so this step is manual.

-- ---------------------------------------------------------------------------
-- 1. Who may drive which vehicle
-- ---------------------------------------------------------------------------
create table if not exists public.vehicle_shares (
  vehicle_id uuid not null references public.vehicles(id) on delete cascade,
  user_id     uuid not null references auth.users(id)    on delete cascade,
  role        text not null default 'driver'
              check (role in ('owner', 'driver')),
  invited_by  uuid references auth.users(id) on delete set null,
  created_at  timestamptz not null default now(),
  primary key (vehicle_id, user_id)
);

create index if not exists vehicle_shares_user_idx
  on public.vehicle_shares (user_id);

-- ---------------------------------------------------------------------------
-- 2. Is this user allowed to touch this vehicle?
--    The app calls this from its RLS policies and from client code.
-- ---------------------------------------------------------------------------
create or replace function public.can_access_vehicle(p_vehicle uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.vehicles v
    where v.id = p_vehicle and v.user_id = auth.uid()
  )
  or exists (
    select 1 from public.vehicle_shares s
    where s.vehicle_id = p_vehicle and s.user_id = auth.uid()
  );
$$;

-- ---------------------------------------------------------------------------
-- 3. Row Level Security for the share table itself
-- ---------------------------------------------------------------------------
alter table public.vehicle_shares enable row level security;

drop policy if exists "shares readable by members" on public.vehicle_shares;
create policy "shares readable by members"
  on public.vehicle_shares for select
  using (
    user_id = auth.uid()
    or exists (
      select 1 from public.vehicles v
      where v.id = vehicle_shares.vehicle_id and v.user_id = auth.uid()
    )
  );

-- Only the owner of the vehicle may add or remove drivers.
drop policy if exists "shares managed by vehicle owner" on public.vehicle_shares;
create policy "shares managed by vehicle owner"
  on public.vehicle_shares for all
  using      (exists (select 1 from public.vehicles v where v.id = vehicle_shares.vehicle_id and v.user_id = auth.uid()))
  with check (exists (select 1 from public.vehicles v where v.id = vehicle_shares.vehicle_id and v.user_id = auth.uid()));

-- ---------------------------------------------------------------------------
-- 4. Widen vehicles + sessions so a shared driver can read AND write them.
--    These replace the owner-only policies created earlier.
-- ---------------------------------------------------------------------------
drop policy if exists "vehicles owner all" on public.vehicles;
drop policy if exists "vehicles are own rows" on public.vehicles;
drop policy if exists "sessions owner all" on public.sessions;
drop policy if exists "sessions are own rows" on public.sessions;

drop policy if exists "vehicles accessible by members" on public.vehicles;
create policy "vehicles accessible by members"
  on public.vehicles for all
  using      (public.can_access_vehicle(id))
  with check (public.can_access_vehicle(id) or user_id = auth.uid());

drop policy if exists "sessions of accessible vehicles" on public.sessions;
create policy "sessions of accessible vehicles"
  on public.sessions for all
  using      (public.can_access_vehicle(vehicle_id))
  with check (public.can_access_vehicle(vehicle_id) or user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- 5. Invite a driver by username.
--    The client never sees other people's email addresses: this function
--    resolves the name to an id itself and returns only a status word.
--
--    Matching is on the part before the "@" so it keeps working if the app's
--    fake domain ever changes (it was @ev-tracker.local, now @evtracker.test).
-- ---------------------------------------------------------------------------
create or replace function public.invite_driver(p_vehicle uuid, p_username text)
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

  if not exists (
    select 1 from public.vehicles v
    where v.id = p_vehicle and v.user_id = auth.uid()
  ) then
    return 'not-owner';
  end if;

  -- match the local part, so any domain works
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

  insert into public.vehicle_shares (vehicle_id, user_id, role, invited_by)
  values (p_vehicle, target, 'driver', auth.uid())
  on conflict (vehicle_id, user_id) do nothing;

  return 'ok';
end;
$$;

grant execute on function public.invite_driver(uuid, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 6. Optional: the driver must not be able to rename or delete the car
--    Uncomment to lock those to the owner only.
-- ---------------------------------------------------------------------------
-- drop policy if exists "vehicles accessible by members" on public.vehicles;
-- create policy "vehicles readable by members" on public.vehicles for select
--   using (public.can_access_vehicle(id));
-- create policy "vehicles writable by owner" on public.vehicles for update
--   using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- 7. Confirm it worked
-- ---------------------------------------------------------------------------
select proname from pg_proc where proname = 'can_access_vehicle';
select tablename from pg_tables where schemaname = 'public' order by tablename;