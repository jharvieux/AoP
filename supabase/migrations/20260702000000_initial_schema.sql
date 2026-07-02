-- Multiplayer schema per docs/MULTIPLAYER.md §3.
--
-- Authority model: every game-state write goes through Edge Functions using the
-- service-role key, which bypasses RLS entirely (see the companion RLS migration).
-- These tables exist so Edge Functions have somewhere to persist match state; no
-- client-side write path exists for any of them except `profiles`.

create extension if not exists pgcrypto;

create table profiles (
  id           uuid primary key references auth.users (id) on delete cascade,
  display_name text not null,
  created_at   timestamptz not null default now()
);

create table matches (
  id             uuid primary key default gen_random_uuid(),
  status         text not null check (status in ('lobby', 'active', 'finished', 'abandoned')),
  settings       jsonb not null, -- map size, turn timer seconds, max players, private?
  seed           bigint not null, -- map + RNG seed; server-generated, never client-chosen
  engine_version text not null, -- @aop/engine version pinned at match start (§10)
  invite_code    text unique, -- join-by-code for private matches
  action_count   int not null default 0,
  turn_deadline  timestamptz, -- null when no timer or match not active
  winner_seat    int,
  created_by     uuid not null references profiles (id),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create table match_players (
  match_id     uuid not null references matches (id) on delete cascade,
  seat         int not null, -- 0-based turn order
  user_id      uuid references profiles (id), -- null => AI seat
  faction      text not null,
  alliance_id  int, -- null => no alliance
  status       text not null check (
    status in ('invited', 'joined', 'active', 'resigned', 'eliminated', 'ai_takeover')
  ),
  missed_turns int not null default 0,
  last_seen_at timestamptz,
  primary key (match_id, seat)
);

create table match_actions (
  match_id   uuid not null references matches (id) on delete cascade,
  seq        int not null, -- 1-based, dense, no gaps
  seat       int not null,
  action     jsonb not null, -- the engine Action, verbatim
  created_at timestamptz not null default now(),
  primary key (match_id, seq)
);

create table match_snapshots (
  match_id uuid not null references matches (id) on delete cascade,
  seq      int not null, -- state AFTER applying actions [1..seq]
  state    jsonb not null, -- full GameState, including rngState
  primary key (match_id, seq)
);

create table entitlements (
  user_id    uuid not null references profiles (id) on delete cascade,
  key        text not null, -- e.g. 'remove_ads'
  source     text not null, -- 'stripe' | 'apple_iap' | 'google_iap' | 'grant'
  granted_at timestamptz not null default now(),
  primary key (user_id, key)
);

-- "my matches" and the turn-deadline sweep (§8), per §3.
create index match_players_user_id_idx on match_players (user_id);
create index matches_status_turn_deadline_idx on matches (status, turn_deadline);
