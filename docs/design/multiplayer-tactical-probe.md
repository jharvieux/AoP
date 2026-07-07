# Multiplayer interactive combat: binding battle sessions (server-side probe authority)

_Design proposal for #321 (multiplayer Tactical naval mode) and the multiplayer
interactive boarding melee (#293's underlying authority problem, referenced by #305).
Companion to [MULTIPLAYER.md](../MULTIPLAYER.md) and D-015. Status: **proposal — requires
operator review before implementation.**_

## 1. Problem statement

Single-player's interactive combat (Tactical naval rounds, #305; boarding melee, #93)
works by **probing**: the client holds the full `GameState` — including `rngState` — so
`probeTacticalBattle` / `probeBoardingBattle` (`apps/web/src/boardingPlanner.ts`) re-run
the deterministic battle from the live RNG state with the orders recorded so far, and a
sentinel-throwing driver halts the simulation at the first undecided round/activation,
handing the UI the engine's own decision context. When the probe resolves, the recorded
orders ride a single `attackCaptain` action and the reducer re-derives the identical
fight — D-015's one-action-per-attack authority model.

Multiplayer cannot do this, by design:

- Clients only ever receive fog-filtered `PlayerView`s; `rngState` never leaves the
  server (MULTIPLAYER.md §7 — with it, a client predicts every future roll).
- There is no server-side probe API. A multiplayer seat with
  `battleResolution: 'tactical'` today silently plays as `'auto'`, and a multiplayer
  attacker's only melee input is a pre-committed `boardOrders` doctrine
  (`packages/engine/src/reducer.ts`, `attackCaptain` handler).

So the question is: **how does a multiplayer client get accurate, per-round decision
context without gaining the ability to cheat?**

### 1.1 The core insight: an accurate probe is an outcome oracle — it must be binding

The issue's suggested angle (1) — a stateless "dry-run" Edge Function that takes a
candidate action, runs it through the reducer against the real server-side state, and
returns the outcome preview — is **unsafe in its naive form**, and it's important to say
why, because it looks so clean:

The engine is deterministic and the battle consumes the match's real `rngState`. A
dry-run against the real state doesn't return _odds_; it returns **the actual outcome**.
A free, non-binding dry-run is therefore a perfect oracle: probe every adjacent target,
probe every tactic sequence, submit only the attack you already know you win, never
submit the ones you lose. That is server-blessed save-scumming — strictly more
information than any single commit would reveal, and no rate limit fixes it (one probe
per turn is already game-breaking; the leak is qualitative, not quantitative). This
answers the issue's angle (2): the anti-abuse problem isn't probe _spam_, it's probe
_retraction_.

Single-player tolerates exactly this because the opponent is the AI and "fairness"
against it is a UX choice. Multiplayer cannot.

**Consequence: any accurate probe must be irrevocable.** Once you've seen round 1's
context, you are committed to the attack; once you've seen round N's context, you are
committed to the tactics that produced it. Formally: information disclosed to the
attacker must be monotone in commitments made — every bit revealed is paid for by an
order the player can no longer take back. This is precisely how single-player's UX
already behaves incrementally (each `TacticalRoundSheet` pick is recorded and the probe
replays it bit-exactly); multiplayer just needs the server to _enforce_ it.

## 2. Recommended approach: server-held **battle sessions**

Keep D-015's one-action-per-attack log format untouched. Make the interactive exchange a
**transport-level session**, not an engine-level state: the server holds the in-progress
order list, runs the probe (the same pure probe code single-player uses) against the
authoritative state on every round, and appends the one final `attackCaptain` action to
`match_actions` only when the battle resolves. The action log, replay contract, engine
purity, and snapshot/compaction machinery are all untouched — a finished match's log is
indistinguishable from one where the attacker precomputed the whole plan.

### 2.1 Flow

1. **Open (binding).** The attacker calls `battle-open` with the attack's identity
   (captain, target, `expectedSeq`). The server validates seat/turn/seq, dry-runs the
   attack's _preconditions_ (adjacency, movement, not-captured, …) via the reducer's own
   validation, then writes a session row. From this moment the attack is committed:
   abandoning the session does not cancel the battle. The response carries the first
   probe outcome (always `awaitingTactic` at round 1 when tactic orders are empty).
2. **Round (one RTT per decision).** Each `battle-round` call appends one order (a naval
   `TacticId`, or a `BoardCommand` once a boarding lands) to the session — guarded by an
   `expectedOrders` length CAS — reconstructs state (snapshot + action tail, same as
   every other function), re-runs the probe with the full recorded prefix, and returns
   the next `awaitingTactic` context / `awaitingCommand` board view, or the resolution.
3. **Resolve.** When the probe returns `resolved`, the server builds the full
   `AttackCaptainAction { attackerOrders, boardCommands }` from the session, pushes it
   through the existing `submitActionInternal` pipeline (append, snapshot, notifications,
   AI auto-play, finalize — all unchanged), deletes the session, and returns
   `{ seq, view, battleReport }` exactly like `submit-action` does for an attack (#285).
4. **Auto-fight button (Tactical mode's escape hatch, per #305/D-002).** `battle-auto`
   force-resolves immediately: submit the action with the orders recorded so far. The
   engine's existing deterministic fallbacks complete the remainder from the logged
   action alone — `tacticPlanDriver` cycles a non-empty naval plan (`broadside` when
   empty), `boardPlanDriver` falls back to the board AI when the command list runs out.
   No new engine semantics needed.
5. **Abandonment.** A session carries its own deadline (bounded by the turn's
   `turn_deadline`). The `sweep-turns` cron force-resolves expired sessions exactly like
   `battle-auto`, _before_ its normal turn-skip logic. A player who disconnects
   mid-battle therefore costs the match at most one session deadline, and their recorded
   rounds still count. Reconnect is free: `battle-open` is idempotent for the same
   attack (returns the current context); the session row is the resume state.

### 2.2 Mutual exclusion

While a session is open for a match, `submit-action` and `end-turn` reject with a new
error code `BATTLE_PENDING` (any other action would advance state underneath the
session's recorded prefix and desync it). Sessions belong to the current seat and die
with the turn, so this blocks nobody but the attacker themself. Read paths
(`get-player-view`) are unaffected.

### 2.3 Why this honors every invariant

- **Engine purity/determinism**: the probe helpers are already pure engine-only code;
  the server runs them under Deno exactly as it runs the reducer. No engine mutation, no
  partial state persisted — a probe is computed and discarded per request.
- **One source of truth**: sessions never store `GameState`; they store only the order
  prefix. Every round re-derives everything from snapshot + log.
- **Replay contract**: `match_actions` still receives exactly one `attackCaptain` per
  battle, byte-shaped like today's. Existing replay tests remain the contract; no new
  action types.
- **Anti-cheat boundary**: `rngState` still never leaves the server. What leaves per
  round is `TacticContext` / `BoardActivationView` — both _documented in the engine as
  symmetric, hidden-info-free views_ (`tactics.ts`: "nothing here is hidden information
  … honest under the D-009 anti-cheat model"; `battleBoard.ts`: "the board is fully
  visible to both sides"). `enemyLastTactic` is the previous round's pick, already in
  the final battle log the attacker would get anyway. The defender's standing orders /
  doctrine are consumed server-side and never serialized to the attacker — the attacker
  only observes their per-round _effects_, identical to what fighting the battle reveals.

## 3. API shape

Three player-facing Edge Functions (matching the one-function-per-verb convention in
`supabase/functions/README.md`; shared logic in `_shared/battleSession.ts`). All require
a JWT; seat derived server-side; shared error envelope.

```
battle-open   POST { matchId, expectedSeq, captainId, targetCaptainId }
              -> { seq, outcome }
battle-round  POST { matchId, expectedOrders, order }
              -> { outcome }         // order: { tactic: TacticId } | { boardCommand: BoardCommand }
battle-auto   POST { matchId }
              -> { seq, view, battleReport }
```

where `outcome` mirrors `TacticalProbeOutcome` (today in `boardingPlanner.ts`):

```ts
type BattleSessionOutcome =
  | { kind: 'awaitingTactic'; ctx: TacticContext } // naval round to pick
  | { kind: 'awaitingCommand'; view: BoardActivationView } // melee activation to command
  | { kind: 'resolved'; seq: number; view: PlayerView; battleReport: BattleReport }
```

New error codes: `BATTLE_PENDING` (submit/end-turn while a session is open; also
`battle-open` for a _different_ attack while one is open), `ORDERS_CONFLICT`
(`expectedOrders` stale — the server-side fix for the closed #293 client race: a rapid
double-command now gets a deterministic conflict instead of a silent drop/reorder).

Validation reuses the existing sanitizers in `_shared/match.ts` (`reqEnum(…, TACTICS)`,
`reqBoardCommand`) so junk never reaches the session row or the final logged action.

### 3.1 Session storage

One row per match (PK enforces one live session at a time), service-role only, no client
RLS access — same posture as `match_snapshots`:

```sql
create table match_battle_sessions (
  match_id          uuid primary key references matches(id) on delete cascade,
  seat              int  not null,
  base_seq          int  not null,   -- matches.action_count at open; resolve appends at base_seq + 1
  captain_id        text not null,
  target_captain_id text not null,
  tactic_orders     jsonb not null default '[]',
  board_commands    jsonb not null default '[]',
  deadline          timestamptz not null,
  created_at        timestamptz not null default now()
);
```

`base_seq` doubles as the concurrency anchor: resolution goes through the existing
`append_match_action` CAS, so a session opened against a state that somehow advanced
(deploy skew, sweep race) fails as `SEQ_CONFLICT`, never as a desynced battle.

> `supabase/migrations/**` is a supervised path — this migration ships only in an
> operator-reviewed implementation PR, never in a sweep.

## 4. Engine changes

**No reducer, action-shape, or `GameState` changes.** Two additive moves:

1. **Move the probe helpers into `@aop/engine`** (e.g. `packages/engine/src/probe.ts`):
   `probeTacticalBattle`, `probeBoardingBattle`, the `AwaitingTactic`/`AwaitingCommand`
   sentinels, and the recording drivers, currently in `apps/web/src/boardingPlanner.ts`.
   They are already pure and import only engine symbols; Edge Functions can then run the
   _same_ probe the client runs. Bonus: `navalAiDriverFor` currently duplicates the
   reducer's private `aiTacticDriverForOwner` with a parity test as a tripwire — moving
   the probe into the engine lets both call one function and deletes the duplication.
   The web app's planner keeps its UI-side helpers (`planMove`, `planAttack`,
   `stackLosses`) and re-exports the moved probes.
2. Nothing else. Forced completion (auto/sweep) deliberately reuses the fallbacks the
   logged action already means (`tacticPlanDriver` cycling, `boardPlanDriver` → board
   AI), so replay needs no new flag. If the cyclic-wrap policy for a truncated naval
   plan is ever deemed too quirky (round N+1 replays pick 1), an additive optional
   `AttackCaptainAction` field selecting a plan-then-AI driver is possible later — out
   of scope here.

## 5. Latency & UX (issue angle 3)

- **Cost per decision: exactly one round trip**, doing the same work as
  `get-player-view` (one snapshot read + at most one player-turn of action tail; the
  probe itself is sub-millisecond — 11×8 board, ≤14 stacks, bounded `maxRounds`).
  Expect ~100–400 ms per pick. A naval tactic pick is a deliberate, seconds-long
  decision; this is comfortably responsive for it.
- **Boarding melee is the stress case**: one RTT per stack activation, potentially
  dozens per battle. Mitigations, in order of preference: (a) optimistic _rendering_ —
  animate the player's own confirmed command instantly, reconcile with the returned
  view (safe: the command is legal-by-construction from the previous authoritative
  view); (b) the auto-fight button is always one tap away; (c) if profiling ever says
  otherwise, `battle-round` can accept a small batch of queued commands. Not designed
  further now.
- **Client-side prediction of outcomes is not viable and never will be**: prediction
  requires the RNG, and withholding the RNG _is_ the anti-cheat boundary. This isn't a
  latency trade-off to tune — it's the security property. The existing scratch-RNG
  **odds preview** (MULTIPLAYER.md §9) remains the pre-commit surface: odds before you
  commit, truth only after you're bound.
- **Session deadline** (operator-tunable; suggested: `min(remaining turn time, ~10
min)`) keeps a mid-battle disconnect from stalling opponents beyond what a normal
  turn timer already allows.

## 6. One design, two issues (issue angle 4)

**Yes — explicitly: this is one mechanism, not two.** `probeTacticalBattle` already
unifies both phases behind one outcome union (`awaitingTactic` for naval rounds,
`awaitingCommand` for melee activations, `resolved` for the report), because a boarding
melee is just a later phase of the same `resolveTacticalCombat` call. The session
protocol above carries `TacticId`s and `BoardCommand`s through the same three endpoints.
Implementing it delivers multiplayer Tactical naval mode (#321/#305) _and_ the
multiplayer interactive boarding melee (the authority blocker #293/#305 reference) in
one stroke, and `ORDERS_CONFLICT` additionally fixes the probe-race class that closed
#293 described, server-side.

## 7. Rejected alternatives

1. **Stateless, non-binding probe endpoint** (the issue's angle 1 taken literally).
   Rejected above (§1.1): a deterministic dry-run against real state is an outcome
   oracle; non-binding access = risk-free save-scumming. No rate limit repairs it.
2. **Ship the client a battle-scoped RNG seed at attack time** (fork a per-battle
   stream; client simulates locally with zero latency). Rejected: the client could
   brute-force the entire decision tree offline before playing round 1 — perfect play
   by enumeration. Also entangles the engine's single-RNG-stream replay format. The
   per-round server round-trip is not an implementation inconvenience; it is the
   _minimal honest disclosure schedule_.
3. **Per-round engine actions** (each tactic pick = one `applyAction` in the log, battle
   state lives in `GameState`). The "purist" event-sourced answer, and D-015 already
   rejected it: doubles the action surface, forces serialized mid-battle sub-states
   into `GameState`, breaks the one-action-per-attack model and every replay
   expectation around it. The session design gets identical replay semantics for a new
   table and three thin functions instead of engine surgery.
4. **Pre-committed plans only** (attacker submits a full doctrine, like defenders'
   standing orders — the status quo fallback in the reducer). Zero new surface, but it
   simply isn't the feature: #305's product request is round-by-round play with
   feedback. Remains the fallback for players who don't open a session.
5. **Trust-but-verify optimistic client simulation with reconciliation.** Nothing to
   simulate with — outcomes depend on withheld RNG (§5). Reconciliation after the fact
   would routinely contradict what the player was shown, which is worse UX than
   waiting one RTT.

## 8. Implementation plan (follow-up PRs, operator-gated where noted)

1. **PR 1 — engine probe extraction** (no behavior change): move
   `probeTacticalBattle`/`probeBoardingBattle` + drivers into `@aop/engine`, unify
   `navalAiDriverFor` with `aiTacticDriverForOwner`, repoint `apps/web` imports, keep
   the existing planner tests green plus add a determinism test that N interleaved
   probes with growing prefixes replay bit-exact prefixes.
2. **PR 2 — schema** (⚠ supervised `supabase/migrations/**`; operator review):
   `match_battle_sessions` table + RLS (no client access) + the session-expiry index.
3. **PR 3 — Edge Functions**: `_shared/battleSession.ts` (open/append/probe/resolve/
   force-resolve), the three functions, `BATTLE_PENDING` guard in
   `submit-action`/`end-turn`, sweep-turns extension, README table rows. Tests: probe
   parity (server probe outcome == final applied battle report for the same prefix),
   CAS conflicts, forced-resolution determinism, and the §7 leak checklist additions
   (no `rngState`/standing-orders bytes in any session response — a serialization
   test, like `spectatorView.test.ts`).
4. **PR 4 — client**: `MatchScreen` attack flow honors `battleResolution: 'tactical'`
   by driving `TacticalRoundSheet`/`BoardingCommandSheet` from the session endpoints
   (the components already consume the engine's own `TacticContext`/
   `BoardActivationView`, so they need transport wiring, not redesign), plus
   resume-on-reconnect and the auto-fight button.
5. **Docs/MEMORY**: MULTIPLAYER.md §5/§7/§11 additions (session contracts, disclosure
   audit rows, threat-model row "probe retraction → sessions are binding"), and a
   D-NNN entry recording this decision once the operator approves the design.

## 9. Open questions for the operator

- Session deadline default (proposal: 10 minutes or remaining turn time, whichever is
  smaller) — is a mid-battle walk-away costing opponents up to 10 extra minutes
  acceptable for async pacing?
- Should forced completion of a truncated _naval_ plan keep `tacticPlanDriver`'s cyclic
  wrap (zero engine change, slightly quirky) — recommended — or add the optional
  plan-then-AI action flag (§4.2)?
- Is the defender ever interactive? This design says no (async: standing orders drive
  the defender, per ARCHITECTURE §6) — a future "both online" live variant could reuse
  sessions with a second seat's cursor, but nothing here depends on it.
