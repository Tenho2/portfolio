-- Which account owns which vehicle.
--
-- Run this ONE statement. It is the question query 5 was supposed to ask.
--
-- Why it is written this way
--   The earlier version used public.vehicle_role(), which resolves against
--   auth.uid(). Run from the SQL editor there is no signed-in user, so
--   auth.uid() is NULL and every row came back role_for_me = null, may_read =
--   false, may_edit = false. That result says nothing about your data; it only
--   says the editor is not signed in. This version compares owner ids directly,
--   which the editor CAN evaluate.
--
-- Paste the three ids you find into the comments below, or just read the table
-- and match them by eye.

-- Step 1. Who are the accounts? Run this, note every id and email.
select id, email, created_at
from auth.users
order by created_at;

-- Step 2. Who owns which vehicle? Run this second.
--
-- Read it like this:
--   owner_user_id matching an id from step 1  -> that account owns the car
--   the same car listed under two accounts     -> impossible, tell me
--
-- Then compare each device's own account against the rows it is trying to push.
-- A device can only write the row whose owner_user_id is its own account; the
-- other one is refused with 42501 on the upsert's UPDATE path, because the id
-- already exists on the server.
select v.id,
       v.name,
       v.user_id as owner_user_id,
       v.deleted_at,
       v.created_at,
       (select u.email from auth.users u where u.id = v.user_id) as owner_email
from public.vehicles v
order by v.created_at;

-- Step 3. Same for charging sessions, so a stranded session row shows up too.
select s.id,
       s.vehicle_id,
       v.name as vehicle_name,
       v.user_id as vehicle_owner,
       s.user_id as session_author,
       s.date,
       s.deleted_at
from public.sessions s
left join public.vehicles v on v.id = s.vehicle_id
order by s.date desc
limit 30;