-- Consolidate redundant permissive SELECT policies into one per table (#550).
--
-- With multiple permissive policies for the same role+action, Postgres OR-combines them
-- but evaluates every one on each read. Each pair below is two permissive SELECT policies
-- with the SAME command (SELECT) and the SAME roles (all created without `TO`, so PUBLIC),
-- so their effective visibility is exactly the OR of the two predicates. Merging each pair
-- into a single policy whose USING is that OR leaves the access set EXACTLY unchanged and
-- removes the per-query duplicate evaluation. The auth.uid() calls carry the wrapped
-- (select auth.uid()) form from #549.
--
-- Before/after visibility (unchanged in every case):
--   profiles         SELECT: own row OR co-participant's row
--   match_chat       SELECT: seated + 'all' channel OR seated-alliance-member + 'alliance'
--   match_spectators SELECT: own grant row OR seated in the watched match

-- profiles: profiles_select_own + profiles_select_co_participants -> profiles_select_visible
drop policy if exists profiles_select_own on profiles;
drop policy if exists profiles_select_co_participants on profiles;
create policy profiles_select_visible on profiles for select
using (
  id = (select auth.uid())
  or exists (
    select 1
    from match_players theirs
    where theirs.user_id = profiles.id
      and theirs.match_id in (select user_match_ids())
  )
);

-- match_chat: match_chat_select_all_channel + match_chat_select_alliance_channel
--   -> match_chat_select_readable
drop policy if exists match_chat_select_all_channel on match_chat;
drop policy if exists match_chat_select_alliance_channel on match_chat;
create policy match_chat_select_readable on match_chat for select
using (
  (
    channel = 'all'
    and exists (
      select 1
      from match_players
      where match_players.match_id = match_chat.match_id
        and match_players.user_id = (select auth.uid())
    )
  )
  or (
    channel = 'alliance'
    and exists (
      select 1
      from match_players
      where match_players.match_id = match_chat.match_id
        and match_players.user_id = (select auth.uid())
        and match_players.alliance_id = match_chat.alliance_id
    )
  )
);

-- match_spectators: match_spectators_select_own + match_spectators_select_participants
--   -> match_spectators_select_visible
drop policy if exists match_spectators_select_own on match_spectators;
drop policy if exists match_spectators_select_participants on match_spectators;
create policy match_spectators_select_visible on match_spectators for select
using (
  user_id = (select auth.uid())
  or exists (
    select 1
    from match_players
    where match_players.match_id = match_spectators.match_id
      and match_players.user_id = (select auth.uid())
  )
);
