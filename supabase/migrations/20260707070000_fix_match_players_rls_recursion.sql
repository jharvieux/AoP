-- Fix infinite recursion in match_players RLS (#217).
--
-- `match_players_select_own_matches` (20260702000001_rls_policies.sql) is defined ON
-- match_players and its USING clause subqueries match_players itself:
--
--   exists (select 1 from match_players mine where mine.match_id = match_players.match_id
--     and mine.user_id = auth.uid())
--
-- Postgres re-applies RLS to every reference to a table inside its own policy
-- expression, including self-references via an alias. That makes this policy
-- recurse into itself at plan time and raise "infinite recursion detected in
-- policy for relation match_players" for every authenticated SELECT.
-- `matches_select_seated` and `profiles_select_co_participants` both query
-- match_players too, so the recursion poisons those reads as well (and, per
-- #227's match_actions_select_finished -> matches -> match_players chain,
-- more transitively still).
--
-- Fix: the standard Supabase pattern — a SECURITY DEFINER helper that reads
-- match_players once, bypassing RLS (the function owner bypasses row security
-- by default), and rewrite the affected policies to call it instead of
-- querying match_players from inside a match_players/matches/profiles policy.
-- Same shape as match_seed() in 20260705000001_restrict_matches_seed.sql:
-- `security definer`, `set search_path = ''`, schema-qualified names so the
-- definer's privileges can't be hijacked via a spoofed search path.

create function user_match_ids(uid uuid)
returns setof uuid
language sql
security definer
set search_path = ''
stable
as $$
  select match_id
  from public.match_players
  where user_id = uid
    and uid = auth.uid()
$$;

revoke execute on function user_match_ids(uuid) from public;
grant execute on function user_match_ids(uuid) to authenticated;

-- match_players: rows for matches the caller is seated in. No more
-- self-reference: user_match_ids() reads match_players internally with RLS
-- bypassed, so evaluating this policy on match_players itself cannot recurse.
drop policy if exists match_players_select_own_matches on match_players;
create policy match_players_select_own_matches on match_players for select
using (match_id in (select user_match_ids(auth.uid())));

-- matches: metadata visible only to seated players. Previously queried
-- match_players directly, which re-triggered match_players' own (then
-- self-referencing) policy; route through the same helper for consistency
-- and so this can never regress into the same recursion shape.
drop policy if exists matches_select_seated on matches;
create policy matches_select_seated on matches for select
using (id in (select user_match_ids(auth.uid())));

-- profiles: co-participants in a shared match. Previously self-joined
-- match_players twice; route the "mine" half through the helper.
drop policy if exists profiles_select_co_participants on profiles;
create policy profiles_select_co_participants on profiles for select
using (
  exists (
    select 1
    from match_players theirs
    where theirs.user_id = profiles.id
      and theirs.match_id in (select user_match_ids(auth.uid()))
  )
);
