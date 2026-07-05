/**
 * Multiplayer transport contracts shared by the server (Supabase Edge Functions,
 * via the `deno.json` import map) and the web client (`apps/web`). Kept in
 * `@aop/shared` so there is exactly one definition of each wire shape — the
 * server that emits it and the client that consumes it can never drift.
 *
 * Must stay free of runtime dependencies (docs/MULTIPLAYER.md §2 engine/shared
 * constraint).
 */

/**
 * The Realtime poke broadcast on channel `match:{id}` after a turn advances
 * (docs/MULTIPLAYER.md §6). It carries a sequence number and nothing else: the
 * §7 leak-audit forbids any game state on this channel, since it is emitted to
 * every seat regardless of fog. Clients react by refetching their own
 * `get-player-view` (§9) — the poke is a nudge, never a source of truth.
 */
export interface TurnBroadcastPayload {
  type: 'turn'
  seq: number
}

/**
 * Build the turn poke. The return shape is exactly `{ type, seq }` — the
 * "sequence number only, never state" leak-audit contract (§7) is enforced by
 * this being the single constructor both sides use, and is unit-tested against
 * that shape.
 */
export function turnBroadcastPayload(seq: number): TurnBroadcastPayload {
  return { type: 'turn', seq }
}

/**
 * Narrow an untrusted inbound broadcast payload to a turn poke. A client acts
 * only on the `seq` it recognizes here and ignores everything else, so a
 * malformed or unexpected payload can never drive a refetch (or worse, be
 * mistaken for state).
 */
export function isTurnBroadcast(value: unknown): value is TurnBroadcastPayload {
  return (
    typeof value === 'object' &&
    value !== null &&
    (value as { type?: unknown }).type === 'turn' &&
    typeof (value as { seq?: unknown }).seq === 'number'
  )
}

/** Outcome of a server-forced timer skip on a seat (docs/MULTIPLAYER.md §8). */
export interface MissedTurnOutcome {
  /** The seat's `missed_turns` after this skip. */
  missedTurns: number
  /** Whether the seat should flip to `ai_takeover` (threshold reached). */
  aiTakeover: boolean
}

/**
 * The `ACTIVE → SKIPPED → AI_TAKEOVER` transition (§8): one more missed turn,
 * flipping to AI takeover once the match's `missedTurnThreshold` is reached.
 * Pure so the state machine is unit-testable without a database.
 */
export function nextMissedTurnStatus(missedTurns: number, threshold: number): MissedTurnOutcome {
  const next = missedTurns + 1
  return { missedTurns: next, aiTakeover: next >= threshold }
}
