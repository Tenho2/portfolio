-- EV Multi-Tracker: leaving a car that was shared with you.
-- Run this in the Supabase SQL editor AFTER 04-roles.sql.
-- Dashboard -> SQL Editor -> New query -> paste -> Run.
--
-- Everything here is idempotent.
--
-- What it does
--   Widens one policy on public.vehicle_shares.
--
--   Before: only the vehicle's owner could delete a share row. A driver who was
--   invited, accepted, and then changed their mind had no way out. The app's
--   share panel returns early for anyone who is not the owner - it prints
--   "you're not the owner" and stops - so there was no button to press, and the
--   database would have refused the row even if there had been one. The share
--   was permanent from the recipient's side.
--
--   After: you may delete your OWN share row, whatever your role and whatever
--   its status. The owner keeps their existing ability to remove anyone.
--
-- Why this is safe
--   The clause added is `vehicle_shares.user_id = auth.uid()`, and it is
--   evaluated per row by RLS. It can only ever match a row that is already
--   yours, so it grants no access to anyone else's share. Combined with the
--   owner's clause the policy reads: "you may delete this row if it is yours,
--   or if you own the car".
--
--   It covers all three states deliberately:
--     accepted   you are a member and want to leave
--     pending    you asked and want to withdraw the request
--     rejected   you want the row cleared so the owner can invite you afresh
--
--   Deleting the row is the whole operation. public.vehicle_role() already
--   grants nothing to a non-accepted share, so the moment the row is gone your
--   rank on that car falls to zero, every can_view_vehicle() check on it
--   returns false, and the car disappears from your list on the next pull.
--   There is no separate "unsubscribe" state to keep in step with this one.
--
-- What it does NOT do
--   It does not delete the vehicle, and it does not delete any charging
--   session. Those belong to the people who logged them. If you leave, your
--   own copy of that car and its sessions goes to your local bin, where it
--   stays until you empty it - but the server will no longer serve them to
--   you, so that bin is a local safety net and not a backup.
--
-- Idempotency
--   The policy is dropped before it is created, so re-running replaces it
--   rather than failing on a duplicate name. RLS combines multiple policies
--   with OR, so a second overlapping policy would also "work" while making the
--   rule impossible to read - hence drop-then-create rather than add.
--
-- Verify after running (expect two rows):
--   select policyname, cmd, qual from pg_policies
--    where tablename = 'vehicle_shares' and cmd = 'DELETE';

drop policy if exists "shares removable by owner" on public.vehicle_shares;

create policy "shares removable by owner or self"
  on public.vehicle_shares for delete
  using (
    -- Your own share, whatever its status and whatever role it carries.
    vehicle_shares.user_id = auth.uid()
    or exists (
      select 1 from public.vehicles v
      where v.id = vehicle_shares.vehicle_id and v.user_id = auth.uid()
    )
  );

-- ---------------------------------------------------------------------------
-- Check, for the record: a share this account holds, and its status.
-- Read-only. Returns nothing if you have no shares, which is not an error.
-- ---------------------------------------------------------------------------
-- select v.name, s.user_id, s.role, s.status
--   from public.vehicle_shares s
--   join public.vehicles v on v.id = s.vehicle_id
--  where s.user_id = auth.uid();