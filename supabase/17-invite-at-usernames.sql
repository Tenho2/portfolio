-- 17-invite-at-usernames.sql
--
-- Usernames may contain @. Supabase Auth still needs an email-shaped
-- identifier, so the client stores a name as <name with @ -> _at_>@evtracker.test.
-- invite_driver() must normalize an invite the same way or an owner cannot
-- invite "pekk@"; the lookup would compare "pekk@" with the stored local part
-- "pekk_at_".
--
-- Run this once on an existing instance. Fresh installs get the same body from
-- 04-roles.sql.

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
  want   text := replace(lower(trim(p_username)), '@', '_at_');
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
