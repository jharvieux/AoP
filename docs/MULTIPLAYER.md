# Multiplayer Technical Spec

_Resolves issue #29. Review gate for all Phase 3 implementation issues (#30–#38).
Companion to [ARCHITECTURE.md](ARCHITECTURE.md) §5._

## 1. Scope

Match-based, asynchronous, turn-based multiplayer for 2–8 players (humans and AI seats) on
Supabase. Non-goals: real-time play, simultaneous turns (the action-log design permits both
later, but nothing here optimizes for them).

## 2. Authority model

The server is the only writer of truth. The "server" is deliberately thin: Edge Functions
that run the **same `@aop/engine` reducer the client runs**, against state reconstructed
from the action log.

- Clients propose `Action` objects; they never write state.
- An Edge Function validates each action by applying it through `applyAction()`. An
  `InvalidActionError` means rejection — the client is buggy or malicious; either way the
  answer is the same.
- Clients never receive full `GameState` in multiplayer. They receive **player views**
  (§7). This is the anti-cheat boundary.
- The client still runs the engine locally for optimistic UI and combat previews, then
  reconciles with the server's accepted sequence (§9).

Engine constraint this imposes (already true, must stay true): `@aop/engine` has zero
runtime dependencies and no DOM/Node APIs, so it runs unmodified under Deno in Edge
Functions.

## 3. Data model

```sql
create table profiles (
  id           uuid primary key references auth.users(id) on delete cascade,
  display_name text not null,
  created_at   timestamptz not null default now()
);

create table matches (
  id             uuid primary key default gen_random_uuid(),
  status         text not null check (status in ('lobby','active','finished','abandoned')),
  settings       jsonb not null,        -- map size, turn timer seconds, max players, private?
  seed           bigint not null,       -- map + RNG seed; server-generated, never client-chosen
  engine_version text not null,         -- @aop/engine version pinned at match start (§10)
  invite_code    text unique,           -- join-by-code for private matches
  action_count   int not null default 0,
  turn_deadline  timestamptz,           -- null when no timer or match not active
  winner_seat    int,
  created_by     uuid not null references profiles(id),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create table match_players (
  match_id     uuid not null references matches(id) on delete cascade,
  seat         int  not null,           -- 0-based turn order
  user_id      uuid references profiles(id),   -- null => AI seat
  faction      text not null,
  alliance_id  int,                     -- null => no alliance
  status       text not null check (status in
                 ('invited','joined','active','resigned','eliminated','ai_takeover')),
  missed_turns int not null default 0,
  last_seen_at timestamptz,
  primary key (match_id, seat)
);

create table match_actions (
  match_id   uuid not null references matches(id) on delete cascade,
  seq        int  not null,             -- 1-based, dense, no gaps
  seat       int  not null,
  action     jsonb not null,            -- the engine Action, verbatim
  created_at timestamptz not null default now(),
  primary key (match_id, seq)
);

create table match_snapshots (
  match_id uuid not null references matches(id) on delete cascade,
  seq      int  not null,               -- state AFTER applying actions [1..seq]
  state    jsonb not null,              -- full GameState, including rngState
  primary key (match_id, seq)
);

create table entitlements (
  user_id    uuid not null references profiles(id) on delete cascade,
  key        text not null,             -- e.g. 'remove_ads'
  source     text not null,             -- 'stripe' | 'apple_iap' | 'google_iap' | 'grant'
  granted_at timestamptz not null default now(),
  primary key (user_id, key)
);
```

Indexes: `match_players(user_id)` for "my matches"; `matches(status, turn_deadline)` for the
timer sweep (§8).

## 4. Row-level security

Everything RLS-on. Two principles: (a) clients read only what the fog of war would show
them — and since per-tile filtering can't be expressed in SQL, **game state tables are not
client-readable at all**; (b) all game-state writes go through Edge Functions using the
service role.

| Table             | Client SELECT                                                                                                                            | Client INSERT/UPDATE         |
| ----------------- | ---------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------- |
| `profiles`        | own row + display_name of co-participants                                                                                                | own row                      |
| `matches`         | rows where user occupies a seat (metadata only — no state lives here beyond counters)                                                    | none (Edge Functions only)   |
| `match_players`   | rows for own matches                                                                                                                     | none                         |
| `match_actions`   | **none while active** (an enemy move's coordinates leak through fog); all rows once `matches.status = 'finished'` (enables replays, §12) | none                         |
| `match_snapshots` | **never** (full state includes hidden info and `rngState`)                                                                               | none                         |
| `entitlements`    | own rows                                                                                                                                 | none (payment webhooks only) |

## 5. Edge Function contracts

All functions require a valid JWT; the caller's seat is derived server-side from
`auth.uid()` — **never trusted from the request body**. Errors use a shared envelope
`{ error: { code, message } }` with codes: `NOT_FOUND`, `NOT_YOUR_TURN`, `SEQ_CONFLICT`,
`INVALID_ACTION`, `MATCH_STATE`, `FORBIDDEN`.

### `create-match`

`POST { settings } → { matchId, inviteCode }`
Server generates `seed` (crypto-random) and pins `engine_version`. Creator occupies seat 0
in `lobby` status. `settings.topology` (`'hex'` default, `'square'` optional, #389) picks
the generated map's grid; settings stored before the field existed rebuild as square.

### `join-match`

`POST { inviteCode | matchId, faction? } → { matchId, seat }`
Seat assignment, faction pick with conflict rejection while in lobby.

### `start-match`

`POST { matchId } → { seq: 0 }`
Creator only. Runs `createGame(config)` from the stored seed/settings, writes snapshot at
`seq 0`, sets `status = 'active'`, sets `turn_deadline`, notifies seat 0.

### `submit-action`

`POST { matchId, expectedSeq, action } → { seq, view }`

The core function. Within one transaction:

1. `SELECT ... FOR UPDATE` the `matches` row (serializes all writers per match).
2. Reject unless `status = 'active'` (`MATCH_STATE`) and `expectedSeq = action_count`
   (`SEQ_CONFLICT` → client refetches its view and reconciles).
3. Reconstruct state: latest snapshot ≤ `action_count`, replay the action tail.
4. Overwrite `action.playerId` with the caller's seat identity (never trust the body), then
   `applyAction()`. `InvalidActionError` → `INVALID_ACTION`, transaction aborted.
5. Append to `match_actions` at `seq = action_count + 1` (PK collision is a second
   concurrency backstop); bump `action_count`.
6. If the turn advanced: update `turn_deadline`, reset the actor's `missed_turns`, write a
   snapshot **on every turn advance** (§10 depends on this cadence), enqueue the
   post-turn pipeline (§6).
7. If the game finished: set `status`, `winner_seat`.

Returns the caller's fresh view so the common case needs no second round trip.

### `get-player-view`

`POST { matchId } → { seq, seat, view, turnDeadline }`
Reconstructs state, returns `visibleState(state, seat)` (§7). Also the reconnect path.

### `resign-match`, `leave-lobby`

Thin wrappers: resign submits the engine `resign` action via the same pipeline.

## 6. Post-turn pipeline

Runs after `submit-action` commits a turn advance (invoked async so submit latency stays
low; idempotent, keyed on `(match_id, action_count)`):

1. **AI seats**: while the current seat is AI or `ai_takeover`, compute the AI's actions
   (issue #13's AI, running server-side) through the same `submit-action` internals.
2. **Notifications**: Supabase Realtime broadcast on channel `match:{id}`
   (`{ type: 'turn', seq }` — a poke, never state); email (Resend) to the new current
   player if they haven't been seen online in >15 minutes.

Until #13 lands, AI seats fall back to submitting `endTurn` (matching today's client stub).

## 7. Fog-of-war player views

`visibleState(state: GameState, seat: number): PlayerView` lives in `@aop/engine`
(single-player fog, issue #14, builds the same selector — one implementation, used on both
sides). Contract:

**Always stripped, regardless of fog:**

- `rngState` — with it, a client can predict every future combat roll and encounter.
  Views carry `rngState: null`; the type system should make `PlayerView` a distinct type
  from `GameState` so engine code can't accidentally accept a view where truth is required.
- Other players' standing orders (Phase 2, #20) — knowing the defender's orders breaks
  interactive attacks.
- Hidden match settings and other seats' notification/contact data.

**Fog-filtered:**

- Tiles: unexplored omitted; explored-not-visible show terrain + last-known static
  structures only (no units).
- Enemy captains/fleets/garrisons: only when inside current vision.
- Enemy resources and city interiors: never (alliance vision shares tiles and units, not
  treasuries — see #36).

**Deliberate disclosures (documented, not leaks):**

- Battle reports involving your seat, redacted to what a participant would learn (enemy
  stack sizes engaged, not reserves elsewhere).
- Public scoreboard aggregates if enabled in match settings (city counts, rough score).

**Leak audit checklist for #34** (each is a test): action log not readable while active
(§4); `SEQ_CONFLICT` responses carry no action content; encounter outcomes visible only to
the triggering player; alliance vision revoked on alliance break; Realtime broadcasts carry
sequence numbers only, never state.

## 8. Turn timers, auto-skip, AI takeover

Per-player-turn state machine, driven by `matches.turn_deadline` and a pg_cron sweep
(every minute, `status = 'active' and turn_deadline < now()`):

```
ACTIVE ──deadline──▶ SKIPPED (server submits endTurn; missed_turns += 1)
   ▲                        │
   │ acts before deadline   │ missed_turns >= threshold (default 3)
   │ (missed_turns := 0)    ▼
   └──────────────── AI_TAKEOVER (AI plays all subsequent turns)
                            │
                            └─ player returns and reclaims seat → ACTIVE
```

- Timer duration is a match setting (async default: 24h/turn; "live" matches can set
  minutes). `turn_deadline` restarts on every turn advance.
- Reclaiming a seat from `ai_takeover` is always allowed and resets `missed_turns` —
  the mechanism protects the other seven players, it doesn't punish the returner.
- AI takeover is a **hard requirement for 5–8 player matches** (one abandoner must not
  stall seven people); 2-player matches may prefer forfeit-on-threshold (match setting).

## 9. Client protocol

1. Open Realtime channel `match:{id}`; call `get-player-view`.
2. On local action: apply optimistically via the local engine against the current view,
   render immediately, send `submit-action` with `expectedSeq`.
3. On `SEQ_CONFLICT` or any rejection: discard optimistic state, refetch view. (Views are
   authoritative wholesale replacements — no diff patching in v1.)
4. On Realtime poke: refetch view. Missed pokes are harmless; any refetch resyncs.

Optimistic caveat: client-side combat previews use a scratch RNG (the real `rngState` is
withheld), so previews show odds, not the actual outcome — matching the single-player
odds-preview UX (#19).

## 10. Snapshots, versioning, migrations

- **Snapshot cadence**: every turn advance (§5.6). Reconstruction cost is therefore one
  snapshot read + at most one player-turn of actions.
- **Engine versioning**: deterministic replay is only guaranteed within one engine
  version. `matches.engine_version` is pinned at start. On engine deploys, active matches
  **continue from their latest snapshot** under the new engine; full-log replay from seq 0
  is only valid when versions match. Consequence: engine changes must keep `GameState`
  backward-compatible (additive fields with defaults) or ship a state migration keyed off
  `engine_version`.
- **Compaction** (#37): while `active`, keep snapshot 0, the latest two snapshots, and one
  per N rounds. Once `finished` (#226), drop straight to just snapshot 0 + the final
  snapshot — the replay viewer always rebuilds from the frozen `GameConfig` plus the full
  action log, never from a snapshot, so nothing in between is load-bearing; the action log
  itself is kept in full, indefinitely, since replays depend on it. `match_chat` is purged
  outright (no archive) for matches finished more than the retention window ago (#226,
  default 30 days) on the same daily cron.

## 11. Threat model

| Attack                                  | Mitigation                                                                        |
| --------------------------------------- | --------------------------------------------------------------------------------- |
| Forged action for another seat          | `playerId` overwritten from JWT (§5.4)                                            |
| Out-of-turn / illegal action            | Engine validation is the single choke point; `InvalidActionError` → reject        |
| Replay or reorder submissions           | `expectedSeq` + `FOR UPDATE` + `(match_id, seq)` PK — three layers                |
| Read full state (map hack)              | State tables not client-readable; only `get-player-view` output leaves the server |
| Predict RNG (combat/encounter outcomes) | `rngState` never leaves the server (§7)                                           |
| Harvest enemy moves from the action log | `match_actions` unreadable until match end (§4)                                   |
| Chosen-seed advantage                   | `seed` is server-generated; client cannot supply it                               |
| Stall the match                         | Turn timers → auto-skip → AI takeover (§8)                                        |
| Snapshot/entitlement tampering          | Service-role-only writes; payment webhooks verify signatures                      |
| Notification spam via channel           | Broadcasts are server-emitted pokes; channel is listen-only for clients           |

Residual risks (accepted for v1, documented): collusion between allied players (a social
problem, not a technical one) and timing side-channels (submission timestamps reveal when
an opponent is online).

## 12. Replays & spectating (forward pointers)

Replays (#38) fall out of the design: once `finished`, the action log becomes readable and
any client can re-run it through the pinned engine version. Live spectating must go through
`visibleState` with either a chosen seat's fog or a delay — never raw state.

**Live spectate, server side (#148, implemented).** Decisions taken:

- **Fog-locked live, no delay.** The `playerView` filter already strips everything a seat
  must not see, so a chosen-seat fog lock is leak-safe with zero delay — no reason to add
  the complexity of a delayed buffer.
- **Reuse the identical filter, unchanged.** `get-player-view` resolves a spectator to one
  pinned seat and feeds it through the _same_ `playerView(state, seat)` call a real player's
  request uses (`_shared/match.ts` `viewerSeat` → `@aop/shared` `resolveViewSeat`). A
  spectator's response is therefore byte-for-byte what that seat's own player would receive —
  asserted by `packages/engine/test/spectatorView.test.ts`, the load-bearing leak-audit test.
- **Explicit grant, closed by default.** Spectators are named authenticated users, never
  anonymous. Only the match creator may designate one, via the `designate-spectator` Edge
  Function; the grant lives in `match_spectators` and pins the single seat to watch
  (`viewing_seat`), server-side — never chosen from a request body (§5).
- **One seat at a time, never god-mode.** The pinned seat plus seat-precedence
  (`resolveViewSeat`: a real seat-holder always sees their own seat, so a player can't
  self-grant a peek at another seat) guarantee a spectator never sees more than one seat's
  fog-locked view.

## 13. Resolved design choices

- Seat identity, not user id, inside engine state — enables AI takeover and seat reclaim
  without touching the action log.
- Views are whole-state-per-fetch, not diffs — simpler, and view payloads at 2–8 player
  map sizes are small; revisit only if payload profiling says otherwise.
- One `submit-action` function rather than per-action endpoints — the engine's action
  union is the API surface; the transport shouldn't mirror it.

## 14. Open questions (decide during #30–#34, none block starting)

- Email provider wiring (Resend is assumed — already available in this workspace).
- Whether lobby chat exists pre-match or chat arrives only with alliances (#36).
- Public matchmaking browser is Phase 4 (#40); until then joins are invite-code only.
