-- ChargeDesk 3.11: who paid for a charge, and a private address book.
--
-- Run after 12-vehicle-capacity.sql.
--
-- ---------------------------------------------------------------------------
-- What this adds
--
--   friends          a private, per-account list of names. Used by the payer
--                    picker, and intended for other features later.
--   session_payers   who split a particular charge, and in what proportion.
--
-- ---------------------------------------------------------------------------
-- The decision that shapes the schema
--
-- session_payers does NOT reference friends. It copies the name.
--
-- The reason is visibility. Anyone who can see a session on a shared car can
-- see who paid for it - that is the whole point of the feature, and the pie
-- chart in the charge log is built from it. If a payer row pointed at a row in
-- somebody's friends table, drawing that chart would mean reading another
-- account's address book. Every member of the car could then enumerate the
-- names of everybody else who has ever paid for a charge, and not just the
-- ones attached to a session they could see. That is a real leak of the
-- address book, and it is the kind that looks like a feature until it is
-- exploited.
--
-- Copying the name avoids it entirely: a payer row carries only what the
-- session itself already implies, and the friends table is never read by
-- anything but its own owner.
--
-- It also makes the history correct. Renaming a friend later does not rewrite
-- old charges, which is what you want in a financial record - "Anna" who was
-- called "Ann" three months ago should still read as "Ann" on the March row.
--
-- ---------------------------------------------------------------------------
-- The share is a fraction of the charge, and the fractions must total 1
--
-- currency, not a percentage: 0.5 means half. Storing the fraction rather than
-- the percentage avoids a column that has to agree with itself about scale.
--
-- A row with no share split at all is the common case and is represented by
-- NO ROW in session_payers. That matters for the log: a charge with no payers
-- is not a charge that one person paid alone, it is a charge nobody has
-- attributed yet, and the two must not collapse into each other. The chart
-- counts those separately and says so.
--
-- ---------------------------------------------------------------------------
-- Totalling is enforced, not trusted
--
-- The client sends one row per payer and the sum has to be exactly 1. The
-- deferred constraint below is what makes that true. It was tempting to check
-- this in the app instead, and that would be wrong: the app is the first
-- writer, not the only one, and a charge whose shares add to 1.3 is exactly the
-- kind of error that has to be impossible rather than unlikely.

begin;

-- ---------------------------------------------------------------------------
-- 1. Friends. Private to their owner, always.
-- ---------------------------------------------------------------------------
create table if not exists public.friends (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  name       text not null check (length(btrim(name)) > 0),
  -- Set when the name was matched to a real account. Left null for the generic
  -- ones: a name typed into the payer picker that was not anybody on the car.
  account_id uuid references auth.users(id) on delete set null,
  -- Marks a name the user invented rather than one they matched to somebody.
  -- Kept so the picker can offer "Anna, not an account" separately and so the
  -- UI can be honest about what it knows.
  generic    boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists friends_user_idx
  on public.friends (user_id);

-- Case-insensitively unique: "Anna" and "anna" are one person, and two rows
-- would split a single payment in the chart.
--
-- A unique INDEX and not a table-level `unique (user_id, lower(name))`.
-- Postgres rejects that with 42601 at or near "(": a table constraint may only
-- name columns, and any expression has to be an index. An expression index can
-- also be dropped and rebuilt, which a constraint cannot.
create unique index if not exists friends_user_name_idx
  on public.friends (user_id, lower(name));

-- ---------------------------------------------------------------------------
-- 2. Payer splits.
-- ---------------------------------------------------------------------------
create table if not exists public.session_payers (
  session_id uuid not null references public.sessions(id) on delete cascade,
  -- The name as written at the time of logging. See the header.
  name       text not null check (length(btrim(name)) > 0),
  account_id uuid references auth.users(id) on delete set null,
  share      numeric not null check (share > 0 and share <= 1),
  created_at timestamptz not null default now(),
  primary key (session_id, name)
);

create index if not exists session_payers_session_idx
  on public.session_payers (session_id);

-- ---------------------------------------------------------------------------
-- 3. The shares of one session must total 1.
--
-- A DEFERRABLE constraint, checked at COMMIT rather than per row, because the
-- client sends the payers one at a time: the first row of a two-person split is
-- legitimately 0.5 on its own and only becomes wrong or right once the second
-- arrives. A row-level check could never allow that.
--
-- It is DEFERRABLE INITIALLY DEFERRED, so a caller that sends several rows in
-- one transaction is checked once at the end. A caller that sends them in
-- separate transactions will fail on the last one - and that failure is
-- correct: a split that was never completed must not become durable.
--
-- The trigger ignores rows being removed, so deleting a payer row - including
-- the cascade when a session is purged - cannot trip it on the way out.
-- ---------------------------------------------------------------------------
create or replace function public.session_payers_total_ok()
returns trigger
language plpgsql
as $$
declare
  total numeric;
begin
  if tg_op = 'DELETE' then
    return null;
  end if;
  select coalesce(sum(share), 0) into total
  from public.session_payers
  where session_id = new.session_id;
  if abs(total - 1) > 0.000001 then
    raise exception 'payers of session % total % instead of 1', new.session_id, total
      using errcode = '23514';
  end if;
  return null;
end;
$$;

drop trigger if exists session_payers_total on public.session_payers;
create constraint trigger session_payers_total
  after insert or update or delete on public.session_payers
  deferrable initially deferred
  for each row execute function public.session_payers_total_ok();

-- ---------------------------------------------------------------------------
-- 4. Replacing a split, atomically.
--
-- The client does not insert its payer rows directly, and that is not tidiness.
--
-- An upsert can only add or overwrite. It cannot remove, so dropping a person
-- from a split would leave their row behind, and the deferred constraint would
-- then correctly refuse the whole save because the shares add to more than 1.
-- The user would be unable to fix the split at all: every attempt fails with
-- an error about a total they can no longer see, caused by a row the interface
-- has no way to display.
--
-- This deletes and re-inserts in one transaction, so the replacement is atomic
-- and the constraint is evaluated once, at the end, over the finished split.
-- p_payers is an array of {name, account_id, share}.
--
-- It refuses anything the caller could not already do directly: the access
-- check is the same can_access_vehicle the policies use, so this is not a way
-- around them.
-- ---------------------------------------------------------------------------
create or replace function public.set_session_payers(
  p_session uuid,
  p_payers  jsonb
)
returns integer
language plpgsql
set search_path = public
as $$
declare
  v_vehicle  uuid;
  v_allowed  uuid;
  v_i        jsonb;
  v_name     text;
  v_account  uuid;
  v_share    numeric;
  v_written  integer := 0;
begin
  select s.vehicle_id, s.user_id into v_vehicle, v_allowed
  from public.sessions s
  where s.id = p_session;

  if v_vehicle is null then
    raise exception 'no such session' using errcode = '23503';
  end if;

  if not public.can_access_vehicle(v_vehicle) and v_allowed <> auth.uid() then
    raise exception 'not allowed to set payers on this session' using errcode = '42501';
  end if;

  delete from public.session_payers where session_id = p_session;

  for v_i in select * from jsonb_array_elements(coalesce(p_payers, '[]'::jsonb))
  loop
    v_name    := btrim(v_i ->> 'name');
    v_share   := coalesce((v_i ->> 'share')::numeric, 0);
    v_account := nullif(v_i ->> 'account_id', '')::uuid;

    if v_name = '' or v_share <= 0 or v_share > 1 then
      raise exception 'a payer needs a name and a share between 0 and 1'
        using errcode = '23514';
    end if;

    insert into public.session_payers (session_id, name, account_id, share)
    values (p_session, v_name, v_account, v_share)
    on conflict (session_id, name) do update
      set share = excluded.share, account_id = excluded.account_id;

    v_written := v_written + 1;
  end loop;

  /* An empty array is a legitimate answer - the split was cleared - so it is
     not an error, and the count of zero says so. */
  return v_written;
end;
$$;

-- ---------------------------------------------------------------------------
-- 5. Row level security.
--
-- Both tables are new, so both are enabled and both are given policies. A table
-- with RLS enabled and no policy is unreadable, which is the safe default and
-- not an oversight here.
--
-- friends: strictly the owner. No exception for vehicle membership, because
-- membership of a car does not entitle anybody to anybody else's address book.
alter table public.friends enable row level security;

drop policy if exists "friends are own rows" on public.friends;
create policy "friends are own rows"
  on public.friends for all
  using      (user_id = auth.uid())
  with check (user_id = auth.uid());

-- session_payers: exactly the rule sessions already uses, so a member of the
-- car can read who paid for a charge and the log's chart can be drawn by
-- anybody who can already see the session. Writing is allowed to a member, or
-- to the author of the session - matching sessions rather than inventing a
-- third notion of who may edit.
drop policy if exists "payers of accessible sessions" on public.session_payers;
create policy "payers of accessible sessions"
  on public.session_payers for all
  using      (
    exists (
      select 1 from public.sessions s
      where s.id = session_payers.session_id
        and public.can_access_vehicle(s.vehicle_id)
    )
  )
  with check (
    exists (
      select 1 from public.sessions s
      where s.id = session_payers.session_id
        and (public.can_access_vehicle(s.vehicle_id) or s.user_id = auth.uid())
    )
  );

-- ---------------------------------------------------------------------------
-- 5. No server-side rollup.
--
-- A function that summed a vehicle's spending per payer was drafted here and
-- then removed. Every other total in the app - the tiles, the month chart, the
-- cost per 100 km - is computed on the device from the sessions it already
-- holds, so a server rollup would be a second implementation of the same
-- arithmetic, free to disagree with the first. Two answers to "who paid what",
-- differing because one was computed on a phone and one on a server, is worse
-- than doing it once.
--
-- The sessions table does not grow a payers column for the same reason as the
-- split being a separate table: a JSON column would have to be rewritten in
-- place, which the row level security policy reads as an update of somebody
-- else's charge.

commit;

-- ---------------------------------------------------------------------------
-- Checks, to run afterwards.
-- ---------------------------------------------------------------------------

-- The columns, and their types.
select table_name, column_name, data_type, is_nullable
from information_schema.columns
where table_schema = 'public'
  and table_name in ('friends', 'session_payers')
order by table_name, ordinal_position;

-- Expected: owner-only on friends.
select policyname, cmd, qual, with_check
from pg_policies
where schemaname = 'public' and tablename = 'friends';

-- Expected: two rows, one for friends and one for session_payers.
select tablename, count(*) as policies
from pg_policies
where schemaname = 'public'
  and tablename in ('friends', 'session_payers')
group by tablename;

-- The shares of one session must total 1. A payer who is not a member of the
-- car is still allowed to have paid for a charge on it - that is the whole
-- feature - but the arithmetic is not negotiable.
select session_id, sum(share) as total, count(*) as payers
from public.session_payers
group by session_id
having abs(sum(share) - 1) > 0.000001;

-- ---------------------------------------------------------------------------
-- The two checks that matter most, and the reason they are not in the block
-- above.
--
-- A policy can exist on a table whose row level security is switched OFF, and
-- then it does nothing: no policy is ever evaluated, so every row is readable
-- and writable by anybody holding the anon key. That would publish the
-- address book to the world, and the policy count above would still read 1.
-- These three queries are what actually prove the migration took.
-- ---------------------------------------------------------------------------

-- 1. Row level security must be ON for both. Expected: friends t, session_payers t.
--    A row saying false here means friends is world-readable. Stop and fix.
select relname as tablename, relrowsecurity as rls_enabled
from pg_class
where relnamespace = 'public'::regnamespace
  and relname in ('friends', 'session_payers')
order by relname;

-- 2. The constraint that makes the shares add up must exist and be deferred.
--    Expected: one row, t, INITIALLY DEFERRED.
select tgname, tgdeferrable, tginitdeferred
from pg_trigger
where tgrelid = 'public.session_payers'::regclass
  and not tgisinternal;

-- 3. The case-insensitive uniqueness of a name. Expected: one row.
select indexname, indexdef
from pg_indexes
where schemaname = 'public'
  and tablename = 'friends'
  and indexdef like '%lower%';
