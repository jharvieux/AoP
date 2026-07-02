-- Row-level security per docs/MULTIPLAYER.md §4.
--
-- Every table gets RLS enabled with client-facing SELECT policies only. There is no
-- INSERT/UPDATE policy on any table except `profiles`: all game-state writes happen in
-- Edge Functions using the service-role key, which bypasses RLS by design (§4 lists
-- "none (Edge Functions only)" / "none (payment webhooks only)" for every other table).
-- `match_snapshots` gets RLS enabled with zero policies, i.e. deny-all for every
-- client-facing role — full state includes hidden info and `rngState` (§7) and must
-- never be client-readable.

alter table profiles enable row level security;
alter table matches enable row level security;
alter table match_players enable row level security;
alter table match_actions enable row level security;
alter table match_snapshots enable row level security;
alter table entitlements enable row level security;

-- profiles: own row, plus the display_name of co-participants in a shared match.
create policy profiles_select_own on profiles for select
using (id = auth.uid());

create policy profiles_select_co_participants on profiles for select
using (
  exists (
    select 1
    from match_players mine
    join match_players theirs on theirs.match_id = mine.match_id
    where mine.user_id = auth.uid()
      and theirs.user_id = profiles.id
  )
);

create policy profiles_insert_own on profiles for insert
with check (id = auth.uid());

create policy profiles_update_own on profiles for update
using (id = auth.uid());

-- matches: metadata visible only to seated players (rows where the user occupies a seat).
create policy matches_select_seated on matches for select
using (
  exists (
    select 1
    from match_players
    where match_players.match_id = matches.id
      and match_players.user_id = auth.uid()
  )
);

-- match_players: rows for matches the caller is seated in.
create policy match_players_select_own_matches on match_players for select
using (
  exists (
    select 1
    from match_players mine
    where mine.match_id = match_players.match_id
      and mine.user_id = auth.uid()
  )
);

-- match_actions: unreadable while the match is active (fog-of-war leak, §7); all rows
-- once finished, enabling replays (§12).
create policy match_actions_select_finished on match_actions for select
using (
  exists (
    select 1
    from matches
    where matches.id = match_actions.match_id
      and matches.status = 'finished'
  )
);

-- entitlements: own rows only.
create policy entitlements_select_own on entitlements for select
using (user_id = auth.uid());
