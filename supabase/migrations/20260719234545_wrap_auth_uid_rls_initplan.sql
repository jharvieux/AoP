-- Wrap bare auth.uid() as (select auth.uid()) in RLS policy predicates (#549).
--
-- Postgres re-evaluates a bare auth.uid() in a policy USING/WITH CHECK for every candidate
-- row; wrapping it as (select auth.uid()) lets the planner hoist it to a one-time initplan
-- (advisor auth_rls_initplan). This is a pure per-row -> per-statement evaluation
-- optimization: each predicate below is semantically IDENTICAL before and after — only the
-- evaluation count changes. Every policy keeps its command, roles, and visibility set.
--
-- Policies already using a subquery form (matches_select_seated,
-- match_players_select_own_matches, match_actions_select_finished,
-- profiles_select_co_participants — all via `(select user_match_ids())` since
-- 20260707225444) are already hoisted and are left untouched.

-- profiles
alter policy profiles_select_own on profiles
  using (id = (select auth.uid()));
alter policy profiles_insert_own on profiles
  with check (id = (select auth.uid()));
alter policy profiles_update_own on profiles
  using (id = (select auth.uid()));

-- entitlements
alter policy entitlements_select_own on entitlements
  using (user_id = (select auth.uid()));

-- cloud_saves (for all: guards both reads and the write post-image)
alter policy cloud_saves_all_own on cloud_saves
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- player_ratings
alter policy player_ratings_select_own on player_ratings
  using (user_id = (select auth.uid()));

-- match_chat
alter policy match_chat_select_all_channel on match_chat
  using (
    channel = 'all'
    and exists (
      select 1
      from match_players
      where match_players.match_id = match_chat.match_id
        and match_players.user_id = (select auth.uid())
    )
  );
alter policy match_chat_select_alliance_channel on match_chat
  using (
    channel = 'alliance'
    and exists (
      select 1
      from match_players
      where match_players.match_id = match_chat.match_id
        and match_players.user_id = (select auth.uid())
        and match_players.alliance_id = match_chat.alliance_id
    )
  );

-- push_tokens (for all)
alter policy push_tokens_all_own on push_tokens
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- match_spectators
alter policy match_spectators_select_own on match_spectators
  using (user_id = (select auth.uid()));
alter policy match_spectators_select_participants on match_spectators
  using (
    exists (
      select 1
      from match_players
      where match_players.match_id = match_spectators.match_id
        and match_players.user_id = (select auth.uid())
    )
  );

-- matchmaking_queue (for all)
alter policy matchmaking_queue_all_own on matchmaking_queue
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));
