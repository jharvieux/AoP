import { applyAction, replay, InvalidActionError, type Action, type GameState } from '@aop/engine'
import type { FactionId, MapSize } from '@aop/shared'
import { AppError } from './http.ts'
import type { Db } from './client.ts'

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
 * play doesn't stall — the documented §6 fallback of submitting `endTurn` until
 * issue #13's AI runs server-side.
 */
export async function submitAction(
  db: Db,
  matchId: string,
  callerSeat: number,
  action: Action,
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
    await resetActorTurnState(db, matchId, callerSeat)
  }
  state = next

  // Auto-play any AI / ai_takeover seats the turn advanced onto.
  const seats = await loadSeats(db, matchId)
  while (state.status === 'active') {
    const seat = parseSeat(state.players[state.currentPlayerIndex]!.id)
    const row = seats.find((s) => s.seat === seat)
    const isAi = !row?.user_id || row.status === 'ai_takeover'
    if (!isAi) break
    const aiAction: Action = { type: 'endTurn', playerId: seatPlayerId(seat) }
    const before = state
    state = applyAction(state, aiAction)
    count = await appendAction(db, matchId, count, seat, aiAction, turnDeadline(match.settings))
    if (turnAdvanced(before, state)) await writeSnapshot(db, matchId, count, state)
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

const ALL_FACTIONS: readonly FactionId[] = ['pirates', 'british', 'spanish', 'dutch']

/** First faction not already taken by another seat; used for defaults and AI seats. */
export function firstFreeFaction(taken: readonly FactionId[]): FactionId {
  const free = ALL_FACTIONS.find((f) => !taken.includes(f))
  if (!free) throw new AppError('MATCH_STATE', 'No factions remain')
  return free
}

export function assertFaction(faction: unknown): FactionId {
  if (typeof faction !== 'string' || !ALL_FACTIONS.includes(faction as FactionId)) {
    throw new AppError('BAD_REQUEST', `Unknown faction ${String(faction)}`)
  }
  return faction as FactionId
}
