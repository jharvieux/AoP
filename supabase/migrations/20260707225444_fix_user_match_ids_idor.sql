-- Fix IDOR in user_match_ids() (#334).
--
-- user_match_ids(uid uuid) (20260707070000_fix_match_players_rls_recursion.sql) is
-- SECURITY DEFINER and granted to `authenticated`, but never checked that the `uid`
-- argument matched the caller. Every RLS policy that uses it always passes auth.uid(),
-- but nothing stopped a client from calling the RPC directly
-- (/rest/v1/rpc/user_match_ids) with an arbitrary victim UUID and getting back the full
-- list of match IDs that victim participates in -- an information-disclosure/IDOR bug.
--
-- Fix: drop the parameter entirely and read auth.uid() inside the function, matching
-- how every call site already invokes it (`select user_match_ids(auth.uid())`). This
-- makes "only your own matches" structural rather than caller-supplied, so there's no
-- argument left to spoof. All four policies that call it (three from
-- 20260707070000_fix_match_players_rls_recursion.sql, plus
-- match_actions_select_finished from 20260707070002) are dropped and recreated with no
-- argument.
drop policy if exists match_players_select_own_matches on match_players;
drop policy if exists matches_select_seated on matches;
drop policy if exists profiles_select_co_participants on profiles;
drop policy if exists match_actions_select_finished on match_actions;
drop function if exists user_match_ids(uuid);

create function user_match_ids()
returns setof uuid
language sql
security definer
set search_path = ''
stable
as $$
  select match_id
  from public.match_players
  where user_id = auth.uid()
$$;

revoke execute on function user_match_ids() from public;
grant execute on function user_match_ids() to authenticated;

create policy match_players_select_own_matches on match_players for select
using (match_id in (select user_match_ids()));

create policy matches_select_seated on matches for select
using (id in (select user_match_ids()));

create policy profiles_select_co_participants on profiles for select
using (
  exists (
    select 1
    from match_players theirs
    where theirs.user_id = profiles.id
      and theirs.match_id in (select user_match_ids())
  )
);

-- match_actions_select_finished (20260707070002_match_actions_finished_participants_only.sql)
-- also called user_match_ids(auth.uid()); recreate with no argument.
create policy match_actions_select_finished on match_actions for select
using (
  match_id in (select user_match_ids())
  and exists (
    select 1
    from matches
    where matches.id = match_actions.match_id
      and matches.status = 'finished'
  )
);

-- Secondary hardening (same review, same area, #334): handle_new_user()
-- (20260704000000_multiplayer_incremental.sql) used `security definer set search_path =
-- public` instead of `search_path = ''`, inconsistent with every other SECURITY DEFINER
-- function in this codebase. Not currently exploitable (it's a trigger, structurally
-- uncallable as a direct RPC, and only performs one schema-qualified insert), but fixed
-- here as defense-in-depth to match convention. Body unchanged otherwise.
create or replace function handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, display_name, is_guest)
  values (
    new.id,
    coalesce(
      new.raw_user_meta_data ->> 'display_name',
      nullif(split_part(coalesce(new.email, ''), '@', 1), ''),
      'Captain ' || substr(new.id::text, 1, 8)
    ),
    coalesce(new.is_anonymous, false)
  )
  on conflict (id) do update
  set is_guest = excluded.is_guest
  where profiles.is_guest is null;
  return new;
end;
$$;
