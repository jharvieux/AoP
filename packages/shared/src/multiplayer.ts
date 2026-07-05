/**
 * Multiplayer transport contracts shared by the server (Supabase Edge Functions,
 * via the `deno.json` import map) and the web client (`apps/web`). Kept in
 * `@aop/shared` so there is exactly one definition of each wire shape — the
 * server that emits it and the client that consumes it can never drift.
 *
 * Must stay free of runtime dependencies (docs/MULTIPLAYER.md §2 engine/shared
 * constraint).
 */

import type { MapSize } from './index'

/**
 * The `@aop/engine` version pinned into `matches.engine_version` when a match
 * is created (`supabase/functions/create-match/index.ts`) and compared
 * against by the replay viewer's version guard
 * (`apps/web/src/multiplayer/matchReplay.ts`, docs/MULTIPLAYER.md §10). Kept
 * here as the single source of truth so the server and client sides can never
 * drift apart on a future engine version bump — bump this alongside any
 * breaking `@aop/engine` change.
 */
export const ENGINE_VERSION = '0.0.1'

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

/**
 * A single open-lobby entry in the public match browser (#150, docs/MULTIPLAYER.md
 * §14 Phase 4). Deliberately a **safe projection** of a `matches` row: it carries
 * only what any authenticated user may learn about a match they have not joined —
 * never `seed` (would enable the §11 chosen-seed / RNG-prediction attacks) nor
 * `invite_code` (would defeat private, invite-only matches). The `matches` table
 * itself stays unreadable to non-seated clients (RLS `matches_select_seated`); this
 * projection reaches the client only through the service-role `list-open-matches`
 * Edge Function, so the table's access model is unchanged.
 */
export interface OpenMatchSummary {
  matchId: string
  mapSize: MapSize
  maxPlayers: number
  /** Seats already taken (human or AI); the match is joinable while this is `< maxPlayers`. */
  playerCount: number
  /** Seconds per turn; `null` for an untimed match. Lets the browser sort live vs async. */
  turnTimerSeconds: number | null
  /** ISO-8601 creation time; doubles as the keyset-pagination cursor. */
  createdAt: string
}

/** Hard cap on one page of the match browser (#150) — a lobby list, not a feed. */
export const OPEN_MATCH_PAGE_MAX = 50

export interface OpenMatchQuery {
  /** Requested page size; silently clamped to `1..OPEN_MATCH_PAGE_MAX`. */
  limit?: number
  /** Keyset cursor: return only matches created strictly before this ISO timestamp. */
  before?: string | null
}

/** Clamp a requested page size into `1..OPEN_MATCH_PAGE_MAX`; undefined/invalid → the max. */
export function clampOpenMatchLimit(limit: number | undefined): number {
  if (limit === undefined || !Number.isFinite(limit)) return OPEN_MATCH_PAGE_MAX
  return Math.min(Math.max(1, Math.floor(limit)), OPEN_MATCH_PAGE_MAX)
}

/** Newest `createdAt` first, `matchId` descending as a stable tiebreaker. */
function compareOpenMatches(a: OpenMatchSummary, b: OpenMatchSummary): number {
  if (a.createdAt !== b.createdAt) return a.createdAt < b.createdAt ? 1 : -1
  return a.matchId < b.matchId ? 1 : a.matchId > b.matchId ? -1 : 0
}

/**
 * Filter, sort, and page the open-match browser list (#150). Pure so the lobby
 * browser's core rules are unit-tested without a live Supabase stack:
 *
 *  - **joinable only**: a seat must be free (`playerCount < maxPlayers`) — a full
 *    lobby is not offered even though its row is still `status = 'lobby'`.
 *  - **newest first**, tie-broken by `matchId` for a deterministic order.
 *  - **keyset paged**: `before` drops anything at or after the previous page's last
 *    `createdAt`; the result is capped at {@link clampOpenMatchLimit}.
 *
 * `status = 'lobby'` and the private-match exclusion are applied upstream (the Edge
 * Function's SQL and projection) before candidates reach here.
 */
export function selectOpenMatches(
  candidates: readonly OpenMatchSummary[],
  query: OpenMatchQuery = {},
): OpenMatchSummary[] {
  const before = query.before ?? null
  return candidates
    .filter((m) => m.playerCount < m.maxPlayers)
    .filter((m) => before === null || m.createdAt < before)
    .sort(compareOpenMatches)
    .slice(0, clampOpenMatchLimit(query.limit))
}
