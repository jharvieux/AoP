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

/** Longest chat message `send-chat` accepts, mirrored by the DB length check. */
export const MAX_CHAT_LENGTH = 500

/**
 * The two chat scopes (#139/#140): `all` reaches every seat in the match;
 * `alliance` reaches only the sender's current alliance cluster. Kept here so the
 * `send-chat` Edge Function and the web client agree on the exact literals.
 */
export type ChatChannel = 'all' | 'alliance'

/** Narrow an untrusted request field to a {@link ChatChannel}. */
export function isChatChannel(value: unknown): value is ChatChannel {
  return value === 'all' || value === 'alliance'
}

/**
 * Trim and length-check a chat body. Pure so both `send-chat` and its tests
 * share one definition of "valid message". Never carries channel or recipient
 * info — that is resolved server-side from the JWT-derived seat (§11).
 */
export function normalizeChatBody(
  raw: unknown,
): { ok: true; body: string } | { ok: false; reason: string } {
  if (typeof raw !== 'string') return { ok: false, reason: 'body must be a string' }
  const body = raw.trim()
  if (body.length === 0) return { ok: false, reason: 'body must not be empty' }
  if (body.length > MAX_CHAT_LENGTH) {
    return { ok: false, reason: `body must be at most ${MAX_CHAT_LENGTH} characters` }
  }
  return { ok: true, body }
}

/**
 * The Realtime poke broadcast on `match:{id}` after a chat message lands
 * (#139), sibling to {@link TurnBroadcastPayload}. It carries the new message's
 * id and nothing else — never the body, never the channel: the poke is emitted
 * to every seat regardless of fog/alliance, so leaking an alliance message's
 * text (or even its channel) on it would violate the §7 leak-audit. Clients
 * react by refetching the chat rows RLS lets them see; a non-member simply gets
 * no new visible row.
 */
export interface ChatBroadcastPayload {
  type: 'chat'
  id: number
}

/** Build the chat poke — exactly `{ type, id }`, the confidentiality contract above. */
export function chatBroadcastPayload(id: number): ChatBroadcastPayload {
  return { type: 'chat', id }
}

/** Narrow an untrusted inbound broadcast payload to a chat poke. */
export function isChatBroadcast(value: unknown): value is ChatBroadcastPayload {
  return (
    typeof value === 'object' &&
    value !== null &&
    (value as { type?: unknown }).type === 'chat' &&
    typeof (value as { id?: unknown }).id === 'number'
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
