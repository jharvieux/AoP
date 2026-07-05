import {
  applyAction,
  nextAiAction,
  replay,
  InvalidActionError,
  type Action,
  type GameState,
} from '@aop/engine'
import {
  FACTION_IDS,
  nextMissedTurnStatus,
  turnBroadcastPayload,
  type FactionId,
  type MapSize,
} from '@aop/shared'
import { AppError } from './http.ts'
import type { Db } from './client.ts'

/** Safety cap on actions a single AI (or ai_takeover) seat may take in one turn
 * (#133) — `nextAiAction` always offers `endTurn` as its zero-score fallback, so
 * this should never bind in practice, but a buggy scorer must never be able to
 * stall the match. The last permitted iteration forces `endTurn` outright. */
const MAX_AI_ACTIONS_PER_TURN = 100

/** Match settings persisted in `matches.settings` (docs/MULTIPLAYER.md §3). */
export interface MatchSettings {
  mapSize: MapSize
  maxPlayers: number
  /** Seconds per turn; null disables the timer. */
  turnTimerSeconds: number | null
  private: boolean
  /** AI seats created up front (seats 1..aiSeats). */
  aiSeats: number
  /** Missed turns before a seat flips to ai_takeover (§8). */
  missedTurnThreshold: number
}

export const ENGINE_VERSION = '0.0.1'

export const seatPlayerId = (seat: number): string => `seat-${seat}`

export function parseSeat(playerId: string): number {
  const seat = Number(playerId.replace('seat-', ''))
  if (!Number.isInteger(seat)) throw new AppError('INTERNAL', `Malformed seat id ${playerId}`)
  return seat
}

interface MatchRow {
  id: string
  status: string
  seed: number
  settings: MatchSettings
  action_count: number
}

interface SeatRow {
  seat: number
  user_id: string | null
  status: string
}

async function loadMatch(db: Db, matchId: string): Promise<MatchRow> {
  const { data, error } = await db
    .from('matches')
    .select('id, status, seed, settings, action_count')
    .eq('id', matchId)
    .maybeSingle()
  if (error) throw new AppError('INTERNAL', error.message)
  if (!data) throw new AppError('NOT_FOUND', 'No such match')
  return data as unknown as MatchRow
}

async function loadSeats(db: Db, matchId: string): Promise<SeatRow[]> {
  const { data, error } = await db
    .from('match_players')
    .select('seat, user_id, status')
    .eq('match_id', matchId)
    .order('seat', { ascending: true })
  if (error) throw new AppError('INTERNAL', error.message)
  return (data ?? []) as SeatRow[]
}

/**
 * Rebuild authoritative state at `upToSeq`: read the newest snapshot at or
 * before it, then replay the action tail through the engine (§5.3, §10). Cost is
 * one snapshot read plus at most one player-turn of actions, because a snapshot
 * is written on every turn advance.
 */
export async function reconstructState(
  db: Db,
  matchId: string,
  upToSeq: number,
): Promise<GameState> {
  const { data: snap, error: snapErr } = await db
    .from('match_snapshots')
    .select('seq, state')
    .eq('match_id', matchId)
    .lte('seq', upToSeq)
    .order('seq', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (snapErr) throw new AppError('INTERNAL', snapErr.message)
  if (!snap) throw new AppError('MATCH_STATE', 'Match has no snapshot yet (not started?)')

  let state = snap.state as unknown as GameState
  if (snap.seq < upToSeq) {
    const { data: rows, error } = await db
      .from('match_actions')
      .select('seq, action')
      .eq('match_id', matchId)
      .gt('seq', snap.seq)
      .lte('seq', upToSeq)
      .order('seq', { ascending: true })
    if (error) throw new AppError('INTERNAL', error.message)
    state = replay(
      state,
      (rows ?? []).map((r) => r.action as unknown as Action),
    )
  }
  return state
}

function turnDeadline(settings: MatchSettings): string | null {
  return settings.turnTimerSeconds
    ? new Date(Date.now() + settings.turnTimerSeconds * 1000).toISOString()
    : null
}

/**
 * Append one already-validated action at `priorCount + 1` and advance the
 * counter. Two concurrency layers, per the threat model (§11): the
 * `(match_id, seq)` primary key rejects a duplicate append (23505), and the
 * `action_count = priorCount` guard on the matches UPDATE rejects a racer who
 * slipped past the read. Either failure surfaces as `SEQ_CONFLICT`.
 */
async function appendAction(
  db: Db,
  matchId: string,
  priorCount: number,
  seat: number,
  action: Action,
  deadline: string | null | undefined,
): Promise<number> {
  const seq = priorCount + 1
  const insert = await db
    .from('match_actions')
    .insert({ match_id: matchId, seq, seat, action: action as unknown as Record<string, unknown> })
  if (insert.error) {
    if (insert.error.code === '23505') throw new AppError('SEQ_CONFLICT', 'Sequence already taken')
    throw new AppError('INTERNAL', insert.error.message)
  }
  // `undefined` deadline means the turn did not advance — leave the running
  // deadline untouched rather than clearing it.
  const patch: Record<string, unknown> = { action_count: seq, updated_at: new Date().toISOString() }
  if (deadline !== undefined) patch.turn_deadline = deadline
  const update = await db
    .from('matches')
    .update(patch)
    .eq('id', matchId)
    .eq('action_count', priorCount)
    .select('id')
  if (update.error) throw new AppError('INTERNAL', update.error.message)
  if (!update.data || update.data.length === 0) {
    throw new AppError('SEQ_CONFLICT', 'Match advanced concurrently')
  }
  return seq
}

async function writeSnapshot(
  db: Db,
  matchId: string,
  seq: number,
  state: GameState,
): Promise<void> {
  const { error } = await db
    .from('match_snapshots')
    .upsert(
      { match_id: matchId, seq, state: state as unknown as Record<string, unknown> },
      { onConflict: 'match_id,seq' },
    )
  if (error) throw new AppError('INTERNAL', error.message)
}

/**
 * Post-commit Realtime poke (§6, §7 leak audit) on channel `match:{id}`. Best
 * effort: a dropped broadcast just means a client waits for its next
 * `get-player-view` refetch instead of an instant nudge (§9), so it must never
 * fail the turn that already committed.
 */
async function broadcastTurn(db: Db, matchId: string, seq: number): Promise<void> {
  const status = await db.channel(`match:${matchId}`).send({
    type: 'broadcast',
    event: 'turn',
    payload: turnBroadcastPayload(seq),
  })
  if (status !== 'ok') {
    console.error(`Turn broadcast for match ${matchId} (seq ${seq}) returned ${status}`)
  }
}

/**
 * Server-forced timer skip (#129, §8) bookkeeping: increments the seat's
 * `missed_turns` (rather than resetting it, as a human's own submission does)
 * and flips the seat to `ai_takeover` once `threshold` is reached. Does not
 * touch `last_seen_at` — that should keep reflecting the player's last real
 * activity, e.g. for the future "notify if idle" email trigger (§6).
 */
async function recordMissedTurn(
  db: Db,
  matchId: string,
  seat: number,
  threshold: number,
): Promise<void> {
  const { data, error } = await db
    .from('match_players')
    .select('missed_turns')
    .eq('match_id', matchId)
    .eq('seat', seat)
    .maybeSingle()
  if (error) throw new AppError('INTERNAL', error.message)
  const { missedTurns, aiTakeover } = nextMissedTurnStatus(data?.missed_turns ?? 0, threshold)
  const patch: Record<string, unknown> = { missed_turns: missedTurns }
  if (aiTakeover) patch.status = 'ai_takeover'
  const update = await db
    .from('match_players')
    .update(patch)
    .eq('match_id', matchId)
    .eq('seat', seat)
  if (update.error) throw new AppError('INTERNAL', update.error.message)
}

async function finalize(db: Db, matchId: string, state: GameState): Promise<void> {
  if (state.status !== 'finished') return
  const winnerSeat = state.winnerId ? parseSeat(state.winnerId) : null
  const { error } = await db
    .from('matches')
    .update({ status: 'finished', winner_seat: winnerSeat, turn_deadline: null })
    .eq('id', matchId)
  if (error) throw new AppError('INTERNAL', error.message)
}

const turnAdvanced = (before: GameState, after: GameState): boolean =>
  before.currentPlayerIndex !== after.currentPlayerIndex || after.status !== 'active'

export interface SubmitResult {
  seq: number
  state: GameState
}

/**
 * The core server-authoritative write (§5.4 `submit-action`). `callerSeat` is
 * the seat the request's JWT resolved to; the action's `playerId` is overwritten
 * from it so a forged `playerId` in the body is meaningless. After a human turn
 * advances onto AI (or `ai_takeover`) seats, those seats are auto-played here so
 * play doesn't stall (§6, #133).
 */
export async function submitAction(
  db: Db,
  matchId: string,
  callerSeat: number,
  action: Action,
): Promise<SubmitResult> {
  return submitActionInternal(db, matchId, callerSeat, action, { skip: false })
}

/**
 * Server-forced turn skip (#129, §8 timer sweep): submits `endTurn` on behalf of
 * the seat whose `turn_deadline` has passed. Goes through the same authoritative
 * pipeline as a human `submitAction`, but the actor's `missed_turns` is
 * incremented (and the seat flipped to `ai_takeover` past the match's
 * `missedTurnThreshold`) instead of being reset — see {@link recordMissedTurn}.
 */
export async function skipExpiredTurn(
  db: Db,
  matchId: string,
  seat: number,
): Promise<SubmitResult> {
  return submitActionInternal(
    db,
    matchId,
    seat,
    { type: 'endTurn', playerId: seatPlayerId(seat) },
    { skip: true },
  )
}

async function submitActionInternal(
  db: Db,
  matchId: string,
  callerSeat: number,
  action: Action,
  opts: { skip: boolean },
): Promise<SubmitResult> {
  const match = await loadMatch(db, matchId)
  if (match.status !== 'active') throw new AppError('MATCH_STATE', `Match is ${match.status}`)

  const priorCount = match.action_count
  let state = await reconstructState(db, matchId, priorCount)

  const currentId = state.players[state.currentPlayerIndex]?.id
  if (currentId !== seatPlayerId(callerSeat)) {
    throw new AppError('NOT_YOUR_TURN', `It is ${currentId ?? 'nobody'}'s turn`)
  }

  const owned: Action = { ...action, playerId: seatPlayerId(callerSeat) }
  let next: GameState
  try {
    next = applyAction(state, owned)
  } catch (err) {
    if (err instanceof InvalidActionError) throw new AppError('INVALID_ACTION', err.message)
    throw err
  }

  const advanced = turnAdvanced(state, next)
  const deadline = advanced ? turnDeadline(match.settings) : undefined
  let count = await appendAction(db, matchId, priorCount, callerSeat, owned, deadline)
  if (advanced) {
    await writeSnapshot(db, matchId, count, next)
    if (opts.skip) {
      await recordMissedTurn(db, matchId, callerSeat, match.settings.missedTurnThreshold)
    } else {
      await resetActorTurnState(db, matchId, callerSeat)
    }
    await broadcastTurn(db, matchId, count)
  }
  state = next

  // Auto-play any AI / ai_takeover seats the turn advanced onto (#133).
  const seats = await loadSeats(db, matchId)
  while (state.status === 'active') {
    const seat = parseSeat(state.players[state.currentPlayerIndex]!.id)
    const row = seats.find((s) => s.seat === seat)
    const isAi = !row?.user_id || row.status === 'ai_takeover'
    if (!isAi) break
    ;({ state, count } = await runAiSeatTurn(db, matchId, seat, match.settings, state, count))
  }

  await finalize(db, matchId, state)
  return { seq: count, state }
}

async function resetActorTurnState(db: Db, matchId: string, seat: number): Promise<void> {
  await db
    .from('match_players')
    .update({ missed_turns: 0, last_seen_at: new Date().toISOString(), status: 'active' })
    .eq('match_id', matchId)
    .eq('seat', seat)
}

/**
 * Play one AI (or `ai_takeover`) seat's whole turn, driving `nextAiAction` from
 * @aop/engine one call at a time (#133) so every action lands in
 * `match_actions` individually and replays identically — the same determinism
 * contract a human's actions get — rather than computing the outcome with
 * `runAiTurn` and writing a single opaque "jump". Falls back to `endTurn` if a
 * proposed action turns out invalid (defensive: `nextAiAction` scores against
 * the same state it's about to act on, so this should never fire) or the
 * per-turn action cap is hit, so a scoring bug can never stall the match.
 */
async function runAiSeatTurn(
  db: Db,
  matchId: string,
  seat: number,
  settings: MatchSettings,
  initialState: GameState,
  priorCount: number,
): Promise<{ state: GameState; count: number }> {
  const playerId = seatPlayerId(seat)
  let state = initialState
  let count = priorCount

  for (let i = 0; i < MAX_AI_ACTIONS_PER_TURN; i++) {
    if (state.status !== 'active' || state.players[state.currentPlayerIndex]?.id !== playerId) {
      break
    }
    const before = state
    const forceEnd = i === MAX_AI_ACTIONS_PER_TURN - 1
    let action: Action
    try {
      action = forceEnd ? { type: 'endTurn', playerId } : nextAiAction(state, playerId)
      state = applyAction(state, action)
    } catch (err) {
      if (!(err instanceof InvalidActionError)) throw err
      action = { type: 'endTurn', playerId }
      state = applyAction(before, action)
    }

    const advanced = turnAdvanced(before, state)
    count = await appendAction(
      db,
      matchId,
      count,
      seat,
      action,
      advanced ? turnDeadline(settings) : undefined,
    )
    if (advanced) {
      await writeSnapshot(db, matchId, count, state)
      await broadcastTurn(db, matchId, count)
    }
    if (action.type === 'endTurn') break
  }

  return { state, count }
}

/** A match currently on the clock: `status = 'active'` and `turn_deadline` has
 * passed (§8). Resolves the seat currently on the clock so callers can skip it
 * without a second round trip. */
export interface ExpiredTurn {
  matchId: string
  seat: number
}

/**
 * Matches whose current `turn_deadline` has passed (#129, the §8 timer sweep's
 * query), paired with the seat that timed out. Reads only — callers apply the
 * skip via {@link skipExpiredTurn}, which independently re-verifies
 * `turn_deadline`-worthy state (via `NOT_YOUR_TURN`/`SEQ_CONFLICT`) so a stale
 * read here can never double-skip a turn a human already took.
 */
export async function findExpiredTurns(db: Db): Promise<ExpiredTurn[]> {
  const { data, error } = await db
    .from('matches')
    .select('id, action_count')
    .eq('status', 'active')
    .lt('turn_deadline', new Date().toISOString())
  if (error) throw new AppError('INTERNAL', error.message)

  const expired: ExpiredTurn[] = []
  for (const row of data ?? []) {
    const state = await reconstructState(db, row.id, row.action_count)
    if (state.status !== 'active') continue
    expired.push({ matchId: row.id, seat: parseSeat(state.players[state.currentPlayerIndex]!.id) })
  }
  return expired
}

/** The seat this user occupies in a match, or `FORBIDDEN` if they hold none. */
export async function callerSeat(db: Db, matchId: string, userId: string): Promise<number> {
  const { data, error } = await db
    .from('match_players')
    .select('seat')
    .eq('match_id', matchId)
    .eq('user_id', userId)
    .maybeSingle()
  if (error) throw new AppError('INTERNAL', error.message)
  if (!data) throw new AppError('FORBIDDEN', 'You do not hold a seat in this match')
  return data.seat
}

/** Validate raw settings from an untrusted request body into a `MatchSettings`. */
export function parseSettings(raw: unknown): MatchSettings {
  const s = (raw ?? {}) as Record<string, unknown>
  const mapSize = s.mapSize
  if (mapSize !== 'small' && mapSize !== 'medium' && mapSize !== 'large') {
    throw new AppError('BAD_REQUEST', 'settings.mapSize must be small | medium | large')
  }
  const maxPlayers = Number(s.maxPlayers)
  if (!Number.isInteger(maxPlayers) || maxPlayers < 2 || maxPlayers > 8) {
    throw new AppError('BAD_REQUEST', 'settings.maxPlayers must be an integer 2..8')
  }
  const aiSeats = s.aiSeats === undefined ? 0 : Number(s.aiSeats)
  if (!Number.isInteger(aiSeats) || aiSeats < 0 || aiSeats > maxPlayers - 1) {
    throw new AppError('BAD_REQUEST', 'settings.aiSeats must leave at least one human seat')
  }
  const timer = s.turnTimerSeconds
  const turnTimerSeconds = timer === null || timer === undefined ? 86400 : Number(timer)
  if (!Number.isFinite(turnTimerSeconds) || turnTimerSeconds <= 0) {
    throw new AppError('BAD_REQUEST', 'settings.turnTimerSeconds must be positive or null')
  }
  const threshold = s.missedTurnThreshold === undefined ? 3 : Number(s.missedTurnThreshold)
  if (!Number.isInteger(threshold) || threshold < 1) {
    throw new AppError('BAD_REQUEST', 'settings.missedTurnThreshold must be a positive integer')
  }
  return {
    mapSize,
    maxPlayers,
    aiSeats,
    turnTimerSeconds: s.turnTimerSeconds === null ? null : turnTimerSeconds,
    private: Boolean(s.private),
    missedTurnThreshold: threshold,
  }
}

/** First faction not already taken by another seat; used for defaults and AI seats. */
export function firstFreeFaction(taken: readonly FactionId[]): FactionId {
  const free = FACTION_IDS.find((f) => !taken.includes(f))
  if (!free) throw new AppError('MATCH_STATE', 'No factions remain')
  return free
}

export function assertFaction(faction: unknown): FactionId {
  if (typeof faction !== 'string' || !FACTION_IDS.includes(faction as FactionId)) {
    throw new AppError('BAD_REQUEST', `Unknown faction ${String(faction)}`)
  }
  return faction as FactionId
}
