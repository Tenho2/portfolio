-- EV Multi-Tracker: the four queries that decide a vehicles 42501.
--
-- Run these ONE AT A TIME. The Supabase SQL editor returns the result of the
-- last statement in a pasted script and nothing else, so pasting all four at
-- once shows you only the final one.
--
-- Read-only. No DDL, no DML. Safe to run in any order, as often as you like.

-- ===========================================================================
-- Q1. Is any policy RESTRICTIVE?
--
-- Permissive policies are ORed: allowed if ANY passes.
-- RESTRICTIVE policies are ANDed: refused if even ONE fails.
--
-- One restrictive INSERT policy on vehicles overrides everything 04-roles.sql
-- installs, including the policy the stamp trigger satisfies. That produces a
-- 42501 for a row the database itself stamped with the caller's own id.
--
-- EXPECT ZERO ROWS.
-- ===========================================================================
select policyname, tablename, cmd, permissive,
       coalesce(qual, '(none)')      as using_expression,
       coalesce(with_check, '(none)') as check_expression
from pg_policies
where schemaname = 'public'
  and tablename in ('vehicles', 'sessions', 'vehicle_shares')
  and permissive = 'RESTRICTIVE'
order by tablename, cmd, policyname;

-- ===========================================================================
-- Q2. What does stamp_row_owner actually DO?
--
-- The trigger existing is not the same as the trigger stamping. If an older
-- copy of 06-owner-stamp.sql ran first, create or replace function left a
-- different body behind and every INSERT keeps whatever the client sent.
--
-- The empty parentheses are required: a regprocedure cast carries the argument
-- list, so 'public.stamp_row_owner'::regprocedure is a syntax error here.
--
-- EXPECT this line inside the body:
--     if tg_op = 'INSERT' and auth.uid() is not null then
--       new.user_id := auth.uid();
-- ===========================================================================
select pg_get_functiondef('public.stamp_row_owner()'::regprocedure) as body;

-- ===========================================================================
-- Q3. Rows the server cannot attribute to anybody.
--
-- THE USUAL ANSWER. EXPECT ZERO ROWS.
--
-- vehicle_role decides ownership with:
--     when v.user_id = auth.uid() then 'owner'
-- With user_id NULL that comparison is NULL, not true, so the role falls
-- through, rank is 0, and the server refuses the row to the account that owns
-- it. The SELECT policy refuses it too, so the app never receives it either.
--
-- Every row returned here is a vehicle nobody can rename, write, or read.
-- ===========================================================================
select v.id,
       v.name,
       v.user_id,
       v.deleted_at,
       v.created_at
from public.vehicles v
where v.user_id is null
order by v.created_at;

-- ===========================================================================
-- Q4. Ownership as the RLS helper functions actually see it.
--
-- role_for_me should read 'owner' for your own vehicles. NULL means the server
-- cannot attribute the row to you, which is precisely why a write is refused
-- and precisely what Q3 lists.
--
-- Replace <your-account-uuid> below with your own id, read from:
--     select id, email from auth.users;
-- ===========================================================================
select v.id,
       v.name,
       v.user_id,
       public.vehicle_role(v.id)  as role_for_me,
       public.vehicle_rank(v.id)  as rank_for_me,
       public.can_view_vehicle(v.id) as may_read,
       public.can_edit_vehicle(v.id) as may_edit,
       (v.user_id = '<your-account-uuid>'::uuid) as is_mine
from public.vehicles v
order by v.created_at;