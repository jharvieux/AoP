-- Live spectate, server side (#148): spectator seats + fogged view access.
-- Adds on top of 20260702000000_initial_schema.sql / 20260702000001_rls_policies.sql.
-- All operations are idempotent (safe to re-run).
--
-- Design (docs/MULTIPLAYER.md §12): a spectator is an EXPLICITLY-granted, authenticated
-- user who receives exactly one seat's fog-locked player view — never raw state, never a
-- second seat. The watched seat is pinned in the grant row (`viewing_seat`), server-side,
-- so it can never be widened from a request body (§5: seat is derived server-side, never
-- trusted from the body). Spectating is kept OUT of `match_players` on purpose: that table's
-- `(match_id, seat)` primary key and its status enum drive turn order and the AI-takeover
-- machinery, and a spectator has neither a turn nor a seat of their own. A dedicated table is
-- the smaller, cleaner change and keeps zero spectator concepts out of the engine/seat loop.

create table if not exists match_spectators (
  match_id     uuid not null references matches (id) on delete cascade,
  user_id      uuid not null references profiles (id) on delete cascade,
  viewing_seat int not null, -- the single seat whose fog-locked view this spectator receives (§12)
  granted_by   uuid not null references profiles (id), -- who authorized the grant (the match creator)
  created_at   timestamptz not null default now(),
  primary key (match_id, user_id)
);

-- "matches I can spectate" lookups.
create index if not exists match_spectators_user_id_idx on match_spectators (user_id);

-- RLS: enabled, SELECT-only for clients, same as every other game table (§4). All writes go
-- through the designate-spectator Edge Function using the service role, which bypasses RLS.
-- A spectator can see their own grant rows; seated players can see who is spectating their
-- match. Crucially there is NO client read path to game state here — the grant row carries
-- only which seat a spectator watches, never the state itself (that still leaves the server
-- exclusively through get-player-view, fog-filtered).
alter table match_spectators enable row level security;

drop policy if exists match_spectators_select_own on match_spectators;
create policy match_spectators_select_own on match_spectators for select
using (user_id = auth.uid());

drop policy if exists match_spectators_select_participants on match_spectators;
create policy match_spectators_select_participants on match_spectators for select
using (
  exists (
    select 1
    from match_players
    where match_players.match_id = match_spectators.match_id
      and match_players.user_id = auth.uid()
  )
);
