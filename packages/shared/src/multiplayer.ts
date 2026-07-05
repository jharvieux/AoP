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

/**
 * The shared `{ error: { code, message } }` envelope every Edge Function
 * returns on failure (docs/MULTIPLAYER.md §5). Kept minimal — only the shape a
 * client needs to recognize a `SEQ_CONFLICT`, not the full `ErrorCode` union
 * (that stays server-side in `supabase/functions/_shared/http.ts`, which has
 * no reason to be imported by the browser bundle).
 */
export interface ErrorEnvelope {
  error: {
    code: string
    message: string
  }
}

/**
 * Narrow an untrusted Edge Function response body to a `SEQ_CONFLICT` error
 * (§9 step 3, §5): the caller's view is stale. The client's only correct
 * reaction is the same one used for every other resync trigger — discard
 * optimistic state and refetch `get-player-view` wholesale (§13), never patch
 * around the conflict in place.
 */
export function isSeqConflict(value: unknown): value is ErrorEnvelope {
  if (typeof value !== 'object' || value === null) return false
  const error = (value as { error?: unknown }).error
  if (typeof error !== 'object' || error === null) return false
  return (error as { code?: unknown }).code === 'SEQ_CONFLICT'
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

/** Terminal `match_players.status` values a seat can never return from (§8). */
const TERMINAL_SEAT_STATUSES: readonly string[] = ['eliminated', 'resigned']

/**
 * Whether a returning human may reclaim their seat from `status` (#134, §8:
 * "the mechanism protects the other seven players, it doesn't punish the
 * returner" — so active/skipped/ai_takeover all reclaim; only a terminal
 * eliminated/resigned seat cannot). Pure so the guard is unit-testable.
 */
export function canReclaimSeat(status: string | null | undefined): boolean {
  return !TERMINAL_SEAT_STATUSES.includes(status ?? '')
}

/** The `match_players` columns a seat reclaim writes back (#134, §8). */
export interface SeatReclaimUpdate {
  status: 'active'
  missed_turns: 0
}

/**
 * The write-back for a reclaimed seat: flip `status` to `active` and zero
 * `missed_turns` (#134, §8). Pure — the endpoint stamps the wall-clock
 * `last_seen_at` around this, keeping the decision itself deterministic and
 * testable without a database or Deno.
 */
export function reclaimSeatUpdate(): SeatReclaimUpdate {
  return { status: 'active', missed_turns: 0 }
}
