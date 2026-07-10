-- Binding battle sessions (#407, #321), design docs/design/multiplayer-tactical-probe.md
-- §3.1 + §10 (interactive defender seat, D-028/D-029). Adds on top of
-- 20260702000000_initial_schema.sql / 20260702000001_rls_policies.sql. All operations are
-- idempotent (safe to re-run).
--
-- What this is (§2): a server-held, transport-level session for an in-progress interactive
-- battle. The server holds the per-round order prefix, re-runs the pure engine probe against
-- the authoritative state each round, and appends the single `attackCaptain` action to
-- `match_actions` only when the battle resolves — so the action log, replay contract, and
-- snapshot machinery are all untouched (§2.3). The session NEVER stores a GameState or
-- `rngState`; it stores only the recorded order lists (§2.3 one-source-of-truth).
--
-- Two seats, not one (§10, D-029 operator override of §9): the defender is interactive too,
-- so the row carries BOTH seats' cursors — each seat only ever appends to its OWN columns,
-- so the two writers touch disjoint state (§10.3). This schema deliberately does NOT assume a
-- single interactive seat (the operator-binding constraint on #407).
--
-- One row per match (the primary key enforces one live session at a time). `base_seq` doubles
-- as the concurrency anchor: resolution goes through the existing `append_match_action` CAS at
-- `base_seq + 1`, so a session opened against a state that somehow advanced fails as
-- SEQ_CONFLICT, never as a desynced battle (§3.1).

create table if not exists match_battle_sessions (
  match_id                uuid primary key references matches (id) on delete cascade,
  -- Seats (§10.3/§10.7): the attacker initiated the attack this turn; the defender is the
  -- target captain's owner seat (may be AI/offline — see `defender_interactive`).
  attacker_seat           int not null,
  defender_seat           int not null,
  -- `matches.action_count` at open; resolve appends the one `attackCaptain` at base_seq + 1.
  base_seq                int not null,
  captain_id              text not null,
  target_captain_id       text not null,
  -- Per-side recorded prefixes (§10.3). Each side appends only to its own two columns; a
  -- `battle-round` write is guarded by a per-side `jsonb_array_length(<caller col>)` CAS, so
  -- the two writers never lose-update each other and a rapid double-submit from one seat gets
  -- a deterministic ORDERS_CONFLICT.
  attacker_tactic_orders  jsonb not null default '[]',
  defender_tactic_orders  jsonb not null default '[]',
  attacker_board_commands jsonb not null default '[]',
  defender_board_commands jsonb not null default '[]',
  -- Flips true on the defender's first order (§10.3); lets the resolver distinguish "defender
  -- chose to play but paused" (interactive, keep its recorded prefix) from "defender never
  -- showed up" (offline → standing orders drive the whole defence, adding zero attacker
  -- latency, §10.1/§10.5).
  defender_interactive    boolean not null default false,
  -- Short per-round grace for the side that owes the current round (§10.5; suggested 30–45 s,
  -- and 0/skipped when the defender is detectably offline). Enforced inline by
  -- `battle-round`/read paths, NOT by the cron — so it is nullable and un-indexed.
  round_deadline          timestamptz,
  -- Whole-battle hard cap (§10.5): min(remaining attacker turn time, config default 5 min ∈
  -- [3,5], per D-028). The single deadline across both seats — not two chess clocks. The
  -- `sweep-turns` cron force-resolves an expired session on THIS column before its normal
  -- turn-skip logic (§2.1 step 5, §8 step 3).
  deadline                timestamptz not null,
  created_at              timestamptz not null default now()
);

-- Session-expiry sweep index (§3.1, §10.7): the cron scans for `deadline` in the past to
-- force-resolve abandoned sessions. Keys on `deadline` only (the per-round grace is enforced
-- inline, never by the cron).
create index if not exists match_battle_sessions_deadline_idx
  on match_battle_sessions (deadline);

-- RLS: enabled with ZERO policies — deny-all for every client-facing role, the exact posture
-- of `match_snapshots` (§4, 20260702000001_rls_policies.sql). All access is service-role only,
-- through the battle-session Edge Functions (#408), which return a per-seat-filtered outcome —
-- never the raw row. This is load-bearing for the §7/§10.6 leak audit: a client must never be
-- able to read the row directly, or a seat could read the OTHER seat's recorded orders (or the
-- defender's standing-orders-derived picks) and break the simultaneity/anti-cheat property.
alter table match_battle_sessions enable row level security;
