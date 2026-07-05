-- Ratings foundation (#151): schema for a per-player Elo-style rating.
--
-- Purely additive — no existing table's semantics change. `player_ratings` holds one
-- row per rated player. Nothing writes to it yet: applying rating updates when a match
-- finishes is #152's job (an Edge Function using the service-role key, per the usual
-- authority model), and leaderboards/UI are #154/#155. This migration is schema only.
--
-- The rating math itself is a pure, I/O-free function in `@aop/shared`
-- (packages/shared/src/rating.ts) — this table is just its durable storage. `rating` is
-- stored as an integer because `applyRatingUpdate` returns rounded integers (see that
-- module for why), so no fractional precision is lost by the column type.

create table player_ratings (
  user_id        uuid primary key references profiles (id) on delete cascade,
  rating         int not null default 1500, -- Elo default "unrated" starting point
  matches_played int not null default 0,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

-- RLS: same authority model as every other game-state table (docs/MULTIPLAYER.md §4) —
-- all writes happen via the service-role key in a future Edge Function (#152), which
-- bypasses RLS entirely, so the only client-facing policy needed here is read-your-own-row.
-- A public/co-participant read policy for leaderboards is out of scope for #151 (#154).
alter table player_ratings enable row level security;

create policy player_ratings_select_own on player_ratings for select
using (user_id = auth.uid());
