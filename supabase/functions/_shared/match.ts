import {
  allianceComponents,
  applyAction,
  applyActionWithOutcome,
  BOARD_DOCTRINES,
  BOARD_ORDER_CONDITIONS,
  createGame,
  ENCOUNTER_CHOICES,
  nextAiAction,
  ORDER_CONDITIONS,
  replay,
  TACTICS,
  InvalidActionError,
  type Action,
  type BattleReport,
  type BoardCommand,
  type BoardOrder,
  type GameConfig,
  type GameState,
  type StandingOrder,
} from '@aop/engine'
import {
  computeMatchRatingUpdates,
  FACTION_IDS,
  nextMissedTurnStatus,
  resolveViewSeat,
  turnBroadcastPayload,
  type Coord,
  type Database,
  type FactionId,
  type Json,
  type MapSize,
  type PlayerRating,
  type RatedSeat,
} from '@aop/shared'
import { buildMatchConfig, type SeatConfig } from './catalog.ts'
import { AppError } from './http.ts'
import type { Db } from './client.ts'
import { dispatchTurnEmail } from './email.ts'
import { dispatchTurnPush } from './push.ts'

/** Safety cap on actions a single AI (or ai_takeover) seat may take in one turn
 * (#133) — `nextAiAction` always offers `endTurn` as its zero-score fallback, so
 * this should never bind in practice, but a buggy scorer must never be able to
 * stall the match. The last permitted iteration forces `endTurn` outright. */
const MAX_AI_ACTIONS_PER_TURN = 100

/** Bounded per-run batch size for the turn-timer sweep (#225) — after any sweep
 * outage every 24h timer can expire at once; without a cap one run tries to
 * process all of them and risks exceeding the edge function's wall-clock/CPU
 * limit, in which case NONE of them get swept. Oldest-deadline-first ordering
 * (see {@link findExpiredTurns}) means the backlog drains in FIFO order across
 * runs instead of starving whichever matches happen to sort last. */
const MAX_EXPIRED_TURNS_PER_SWEEP = 50

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
  /** Host-chosen betrayal reputation cost (#177); overrides `GAME_SETUP.betrayalReputationPenalty`. */
  betrayalReputationPenalty: number
  /** Host-chosen betrayal truce window in rounds (#177); overrides `GAME_SETUP.betrayalTruceRounds`. `0` disables the truce. */
  betrayalTruceRounds: number
}

/** A server-generated map + RNG seed (§11 chosen-seed advantage: never client-chosen).
 * Shared by create-match and the quick-match drain. */
export function randomSeed(): number {
  return crypto.getRandomValues(new Uint32Array(1))[0]! % 2 ** 31
}

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

/** Adapts the DB's snake_case `SeatRow`s to the plain-data shape
 * `turnNotificationRecipient` (`@aop/shared/push`) works with. */
const toTurnSeats = (seats: readonly SeatRow[]) =>
  seats.map((s) => ({ seat: s.seat, userId: s.user_id, status: s.status }))

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

// --- sanitizeAction field validators (#206). Every value below comes straight
// from the client's JSON body, so nothing may be copied through unchecked:
// numbers must be finite safe integers (NaN/Infinity/fractional all reject —
// the engine's own guards like `count <= 0` are blind to NaN), enums must be a
// known member, and nested objects are rebuilt key-by-key so junk can't ride
// inside them. Violations reject the whole submission as BAD_REQUEST.

function badField(field: string, want: string): AppError {
  return new AppError('BAD_REQUEST', `action.${field} must be ${want}`)
}

function reqString(value: unknown, field: string): string {
  if (typeof value !== 'string' || value.length === 0) throw badField(field, 'a non-empty string')
  return value
}

function reqInt(value: unknown, field: string): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value)) {
    throw badField(field, 'an integer')
  }
  return value
}

function reqEnum<T extends string>(value: unknown, allowed: readonly T[], field: string): T {
  if (typeof value !== 'string' || !(allowed as readonly string[]).includes(value)) {
    throw badField(field, `one of: ${allowed.join(', ')}`)
  }
  return value as T
}

function reqObject(value: unknown, field: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw badField(field, 'an object')
  }
  return value as Record<string, unknown>
}

function reqArray<T>(value: unknown, field: string, item: (v: unknown, f: string) => T): T[] {
  if (!Array.isArray(value)) throw badField(field, 'an array')
  return value.map((v, i) => item(v, `${field}[${i}]`))
}

function reqCoord(value: unknown, field: string): Coord {
  const v = reqObject(value, field)
  return { x: reqInt(v.x, `${field}.x`), y: reqInt(v.y, `${field}.y`) }
}

function reqStandingOrder(value: unknown, field: string): StandingOrder {
  const v = reqObject(value, field)
  return {
    when: reqEnum(v.when, ORDER_CONDITIONS, `${field}.when`),
    tactic: reqEnum(v.tactic, TACTICS, `${field}.tactic`),
  }
}

function reqBoardOrder(value: unknown, field: string): BoardOrder {
  const v = reqObject(value, field)
  return {
    when: reqEnum(v.when, BOARD_ORDER_CONDITIONS, `${field}.when`),
    doctrine: reqEnum(v.doctrine, BOARD_DOCTRINES, `${field}.doctrine`),
  }
}

function reqBoardCommand(value: unknown, field: string): BoardCommand {
  const v = reqObject(value, field)
  const out: BoardCommand = { stackId: reqInt(v.stackId, `${field}.stackId`) }
  if (v.to !== undefined) {
    const to = reqObject(v.to, `${field}.to`)
    out.to = { col: reqInt(to.col, `${field}.to.col`), row: reqInt(to.row, `${field}.to.row`) }
  }
  if (v.targetId !== undefined) out.targetId = reqInt(v.targetId, `${field}.targetId`)
  return out
}

/**
 * Rebuilds the persisted representation of an action from a per-type whitelist
 * of known fields (#223), validating every field structurally as it copies
 * (#206) — `appendAction` used to insert the caller's action verbatim (spread
 * straight from the client's JSON body), so a hostile client could ride
 * arbitrary extra top-level keys into `match_actions` forever, or plant
 * NaN/Infinity/fractional numbers and unknown enum strings that the engine's
 * semantic guards never check for. Runs at the submit-action boundary (before
 * the engine sees the payload) and again in `appendAction` — the single choke
 * point every action (human or AI) passes through on its way into the log.
 * The `octet_length` CHECK on `match_actions.action` remains the byte-size
 * backstop. Keep this switch in sync with the `Action` union in
 * `packages/engine/src/actions.ts` — the `never` default makes an unhandled
 * new action type a compile error, not a silent pass-through.
 */
export function sanitizeAction(action: Action): Action {
  const playerId = reqString(action.playerId, 'playerId')
  switch (action.type) {
    case 'endTurn':
      return { type: action.type, playerId }
    case 'resign':
      return { type: action.type, playerId }
    case 'moveCaptain':
      return {
        type: action.type,
        playerId,
        captainId: reqString(action.captainId, 'captainId'),
        to: reqCoord(action.to, 'to'),
      }
    case 'attackCaptain':
      return {
        type: action.type,
        playerId,
        captainId: reqString(action.captainId, 'captainId'),
        targetCaptainId: reqString(action.targetCaptainId, 'targetCaptainId'),
        ...(action.attackerOrders !== undefined
          ? {
              attackerOrders: reqArray(action.attackerOrders, 'attackerOrders', (v, f) =>
                reqEnum(v, TACTICS, f),
              ),
            }
          : {}),
        ...(action.boardCommands !== undefined
          ? { boardCommands: reqArray(action.boardCommands, 'boardCommands', reqBoardCommand) }
          : {}),
      }
    case 'setStandingOrders':
      return {
        type: action.type,
        playerId,
        captainId: reqString(action.captainId, 'captainId'),
        orders: reqArray(action.orders, 'orders', reqStandingOrder),
        ...(action.boardOrders !== undefined
          ? { boardOrders: reqArray(action.boardOrders, 'boardOrders', reqBoardOrder) }
          : {}),
      }
    case 'construct':
      return {
        type: action.type,
        playerId,
        cityId: reqString(action.cityId, 'cityId'),
        buildingId: reqString(action.buildingId, 'buildingId'),
      }
    case 'recruit':
      return {
        type: action.type,
        playerId,
        cityId: reqString(action.cityId, 'cityId'),
        unitId: reqString(action.unitId, 'unitId'),
        count: reqInt(action.count, 'count'),
      }
    case 'transferTroops':
      return {
        type: action.type,
        playerId,
        cityId: reqString(action.cityId, 'cityId'),
        captainId: reqString(action.captainId, 'captainId'),
        direction: reqEnum(action.direction, ['toShip', 'toGarrison'] as const, 'direction'),
        unitId: reqString(action.unitId, 'unitId'),
        count: reqInt(action.count, 'count'),
      }
    case 'gainCaptainXp':
      return {
        type: action.type,
        playerId,
        captainId: reqString(action.captainId, 'captainId'),
        amount: reqInt(action.amount, 'amount'),
      }
    case 'chooseCaptainSkill':
      return {
        type: action.type,
        playerId,
        captainId: reqString(action.captainId, 'captainId'),
        skillId: reqString(action.skillId, 'skillId'),
      }
    case 'upgradeShip':
      return {
        type: action.type,
        playerId,
        cityId: reqString(action.cityId, 'cityId'),
        captainId: reqString(action.captainId, 'captainId'),
        track: reqString(action.track, 'track'),
      }
    case 'resolveEncounter':
      return {
        type: action.type,
        playerId,
        captainId: reqString(action.captainId, 'captainId'),
        encounterId: reqString(action.encounterId, 'encounterId'),
        choice: reqEnum(action.choice, ENCOUNTER_CHOICES, 'choice'),
      }
    case 'proposeAlliance':
      return { type: action.type, playerId, targetId: reqString(action.targetId, 'targetId') }
    case 'acceptAlliance':
      return {
        type: action.type,
        playerId,
        proposerId: reqString(action.proposerId, 'proposerId'),
      }
    case 'leaveAlliance':
      return { type: action.type, playerId, otherId: reqString(action.otherId, 'otherId') }
    default: {
      // Compile-time exhaustiveness guard; at runtime this is a hostile
      // client's unknown type string, so reject the request, not the server.
      const exhaustive: never = action
      throw new AppError(
        'BAD_REQUEST',
        `Unknown action type ${JSON.stringify((exhaustive as Action).type)}`,
      )
    }
  }
}

/**
 * Rejects engine actions a client may never submit (#205). `gainCaptainXp`
 * exists in the `Action` union so the engine can model XP as replayable data,
 * but every legitimate grant happens INSIDE the engine while it resolves
 * another action (combat's `wonXp`, an encounter's `xpGained`) — no client,
 * AI, or server code ever proposes it as a standalone action. Accepting it
 * from a request body would let a hostile client award itself arbitrary XP
 * (`applyAction` applies the amount verbatim), so the only valid expected
 * value is "never". Enforced in {@link submitAction}, the single entry point
 * for client-proposed actions.
 */
export function assertClientSubmittable(action: Action): void {
  if (action.type === 'gainCaptainXp') {
    throw new AppError(
      'INVALID_ACTION',
      'gainCaptainXp cannot be submitted directly; XP is awarded by the server',
    )
  }
}

function turnDeadline(settings: MatchSettings): string | null {
  return settings.turnTimerSeconds
    ? new Date(Date.now() + settings.turnTimerSeconds * 1000).toISOString()
    : null
}

/**
 * Look up display names for a set of user ids in one query (#231). Replaces four
 * near-identical inline copies (start-match, the quick-match drain,
 * get-leaderboard, browse-maps); a missing profile is simply absent from the
 * returned map, so each caller keeps its own fallback (`Seat N`, `Unknown
 * Pirate`, ...).
 */
export async function displayNames(
  db: Db,
  userIds: readonly string[],
): Promise<Map<string, string>> {
  const names = new Map<string, string>()
  const ids = [...new Set(userIds)]
  if (ids.length === 0) return names
  const { data, error } = await db.from('profiles').select('id, display_name').in('id', ids)
  if (error) throw new AppError('INTERNAL', error.message)
  for (const p of data ?? []) names.set(p.id, p.display_name)
  return names
}

/** A seat's engine-relevant identity, independent of which DB row shape supplied it. */
export interface StartMatchSeat {
  seat: number
  /** `null` marks an AI seat. */
  userId: string | null
  faction: FactionId
}

/**
 * Pure half of {@link startMatch} (#231): builds the frozen engine config a match
 * starts from, given each seat's already-resolved display name. Split out from
 * the I/O so quick-match's and start-match's seat data — read from two different
 * DB row shapes but normalized to the same {@link StartMatchSeat} — can be proven
 * to build byte-identical `GameConfig`/`GameState` without faking a database.
 */
export function buildStartMatchConfig(
  seed: number,
  settings: MatchSettings,
  seats: readonly StartMatchSeat[],
  names: ReadonlyMap<string, string>,
): GameConfig {
  const seatConfigs: SeatConfig[] = seats.map((s) => ({
    seat: s.seat,
    faction: s.faction,
    isAI: s.userId === null,
    displayName: s.userId ? (names.get(s.userId) ?? `Seat ${s.seat}`) : `AI ${s.seat}`,
  }))
  return buildMatchConfig(seed, settings.mapSize, seatConfigs, {
    betrayalReputationPenalty: settings.betrayalReputationPenalty,
    betrayalTruceRounds: settings.betrayalTruceRounds,
  })
}

/**
 * Shared match-start sequence (#231): resolve display names, build the frozen
 * engine config, run `createGame`, write the seq-0 snapshot, then guard-flip the
 * match `lobby` -> `active` and arm the first turn deadline. Used by both
 * start-match (an existing lobby match its creator starts) and the quick-match
 * drain (a match created and seated in the same request) — the
 * snapshot-before-activate ordering and the status-guarded flip are the
 * load-bearing invariants neither caller may reimplement differently (a match is
 * never visible to the turn sweep or submit-action without its seq-0 snapshot).
 * Throws `MATCH_STATE` if the match was somehow already started.
 */
export async function startMatch(
  db: Db,
  matchId: string,
  seed: number,
  settings: MatchSettings,
  seats: readonly StartMatchSeat[],
): Promise<void> {
  const humanIds = seats.map((s) => s.userId).filter((id): id is string => id !== null)
  const names = await displayNames(db, humanIds)
  const state = createGame(buildStartMatchConfig(seed, settings, seats, names))
  await writeSnapshot(db, matchId, 0, state)

  const activate = await db
    .from('matches')
    .update({
      status: 'active',
      action_count: 0,
      turn_deadline: turnDeadline(settings),
      updated_at: new Date().toISOString(),
    })
    .eq('id', matchId)
    .eq('status', 'lobby')
    .select('id')
  if (activate.error) throw new AppError('INTERNAL', activate.error.message)
  if (!activate.data || activate.data.length === 0) {
    throw new AppError('MATCH_STATE', 'Match was already started')
  }
}

/**
 * Shapes the atomic `append_match_action` RPC's arguments (#216). The
 * `undefined` / `null` / ISO-string trichotomy of `deadline` is encoded as
 * `(p_set_deadline, p_deadline)`: `undefined` means the turn did not advance,
 * so the running deadline is left untouched (`p_set_deadline: false`); `null`
 * means the turn advanced with no timer, clearing it. As with
 * {@link finalizeRpcArgs} (#265), the generated Args type omits `| null` for
 * the plpgsql scalar `p_deadline`, so the null case is cast rather than
 * replaced with a sentinel timestamp.
 *
 * The action is persisted through {@link sanitizeAction} (#223/#206), not
 * spread verbatim — this is the single choke point every action
 * (human-submitted or AI-generated) passes through on its way into the log.
 */
export function appendActionRpcArgs(
  matchId: string,
  priorCount: number,
  seat: number,
  action: Action,
  deadline: string | null | undefined,
): {
  p_match_id: string
  p_prior_count: number
  p_seat: number
  p_action: Json
  p_deadline: string
  p_set_deadline: boolean
} {
  return {
    p_match_id: matchId,
    p_prior_count: priorCount,
    p_seat: seat,
    p_action: sanitizeAction(action) as unknown as Json,
    p_deadline: (deadline ?? null) as unknown as string,
    p_set_deadline: deadline !== undefined,
  }
}

/**
 * Append one already-validated action at `priorCount + 1` and advance the
 * counter — in ONE database transaction, the `append_match_action` RPC (#216).
 * Previously these were two separate PostgREST round-trips; a crash between
 * them left a committed action row above `action_count`, and every later
 * append then hit the `(match_id, seq)` primary key forever — a permanently
 * wedged match. Both concurrency layers of the threat model (§11) survive
 * inside the RPC: the `action_count = priorCount` CAS rejects a racer who
 * slipped past the read (SQLSTATE `SC409`), and the `(match_id, seq)` primary
 * key backstops a deploy-skew duplicate (23505). Either failure rolls the
 * whole transaction back and surfaces as `SEQ_CONFLICT`. The RPC also deletes
 * any orphan rows the pre-RPC crash window already left, un-wedging previously
 * stuck matches on their next append.
 */
export async function appendAction(
  db: Db,
  matchId: string,
  priorCount: number,
  seat: number,
  action: Action,
  deadline: string | null | undefined,
): Promise<number> {
  const { data, error } = await db.rpc(
    'append_match_action',
    appendActionRpcArgs(matchId, priorCount, seat, action, deadline),
  )
  if (error) {
    if (error.code === 'SC409' || error.code === '23505') {
      throw new AppError('SEQ_CONFLICT', 'Match advanced concurrently')
    }
    throw new AppError('INTERNAL', error.message)
  }
  return data
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
      { match_id: matchId, seq, state: state as unknown as Json },
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
  const patch: Database['public']['Tables']['match_players']['Update'] = {
    missed_turns: missedTurns,
  }
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

  // Compute the rating results in TypeScript (the pure #152 math), then hand them
  // to the RPC to persist. This read is safe to run on any finalize attempt: a
  // race-loser simply computes rows the RPC will discard.
  const ratings = await computeRatingUpserts(db, matchId, state)

  // The active->finished flip AND the player_ratings upserts run inside ONE DB
  // transaction (#189): they commit together or not at all, closing the crash
  // window where the old two-round-trip finalize could strand a match 'finished'
  // with its rating write permanently lost. The `status = 'active'` idempotency
  // guard lives inside the RPC and matches a row exactly once, so a retry or a
  // concurrent finalize that loses the race applies nothing — rating updates can
  // never be double-applied, the same guarantee as before, now atomic.
  const { data: applied, error } = await db.rpc(
    'finalize_match_with_ratings',
    finalizeRpcArgs(matchId, winnerSeat, ratings),
  )
  if (error) throw new AppError('INTERNAL', error.message)
  if (!applied) {
    console.log(`finalize: match ${matchId} already finished, ratings not re-applied`)
  }
}

export interface RatingUpsertRow {
  user_id: string
  rating: number
  matches_played: number
}

/**
 * Shapes the atomic RPC's arguments for a match finalize (#189, #265). `winnerSeat` is
 * `null` for a draw / mutual-elimination win — genuinely supported both by the SQL
 * function's `p_winner_seat int` parameter (no `NOT NULL`) and by the nullable
 * `matches.winner_seat` column (see
 * supabase/migrations/20260706000002_finalize_match_with_ratings.sql) — but the
 * generated `finalize_match_with_ratings` RPC `Args` type omits `| null` for it: Supabase's
 * function-arg codegen doesn't derive nullability for plpgsql scalar parameters, so
 * regenerating `database.types.ts` will never add it. Cast rather than substitute a
 * sentinel fallback (e.g. `0`), which would misattribute a draw to seat 0.
 */
export function finalizeRpcArgs(
  matchId: string,
  winnerSeat: number | null,
  ratings: readonly RatingUpsertRow[],
): { p_match_id: string; p_winner_seat: number; p_ratings: Json } {
  return {
    p_match_id: matchId,
    p_winner_seat: winnerSeat as number,
    p_ratings: ratings as unknown as Json,
  }
}

/**
 * Compute the Elo rating rows to persist for a match that just transitioned to
 * finished (#152). Only seats held by a real authenticated user are rated; AI
 * seats (`user_id is null`) are excluded. The multi-player-to-pairwise model,
 * first-time-player defaulting, and every no-op case live in the pure,
 * unit-tested {@link computeMatchRatingUpdates}; this wrapper only reads the
 * current ratings and shapes the results for {@link finalize}'s atomic RPC write
 * (#189). Returns `[]` when nothing is rated (all-AI match, or no rating moved),
 * in which case the RPC still performs the status flip and upserts nothing.
 */
async function computeRatingUpserts(
  db: Db,
  matchId: string,
  state: GameState,
): Promise<RatingUpsertRow[]> {
  const seatRows = await loadSeats(db, matchId)
  const userIds = seatRows.map((s) => s.user_id).filter((id): id is string => id !== null)
  if (userIds.length === 0) return []

  const { data: rows, error } = await db
    .from('player_ratings')
    .select('user_id, rating, matches_played')
    .in('user_id', userIds)
  if (error) throw new AppError('INTERNAL', error.message)

  const current = new Map<string, PlayerRating>(
    (rows ?? []).map((r) => [r.user_id, { rating: r.rating, matchesPlayed: r.matches_played }]),
  )

  const seats: RatedSeat[] = seatRows.map((s) => ({
    userId: s.user_id,
    won: state.winnerId === seatPlayerId(s.seat),
  }))

  const updated = computeMatchRatingUpdates(seats, current)
  return [...updated].map(([userId, r]) => ({
    user_id: userId,
    rating: r.rating,
    matches_played: r.matchesPlayed,
  }))
}

const turnAdvanced = (before: GameState, after: GameState): boolean =>
  before.currentPlayerIndex !== after.currentPlayerIndex || after.status !== 'active'

export interface SubmitResult {
  seq: number
  state: GameState
  /**
   * The structured combat outcome of the caller's own action, if it was an
   * attack (#285) — dropped before this, so a multiplayer client had no way
   * to show what an attack actually did beyond the before/after view diff.
   * Only ever the *submitting* seat's own action outcome, never one produced
   * by the AI auto-play loop below (that never reported to the human whose
   * turn triggered it either, in single-player terms).
   */
  battleReport?: BattleReport
}

/**
 * Optimistic-concurrency pre-check shared by `submit-action` and `end-turn`
 * (#232): rejects a request whose `expectedSeq` no longer matches the match's
 * authoritative `action_count` as SEQ_CONFLICT, so a caller acting on a stale
 * view fails fast with a retriable error instead of racing. A missing match
 * falls through untouched — {@link submitAction}'s own load raises the proper
 * NOT_FOUND. Advisory only: the append itself is still serialized by the
 * `(match_id, seq)` primary key and the `action_count` CAS in `appendAction`,
 * so a racer that slips between this read and the append still loses safely.
 */
export async function assertExpectedSeq(
  db: Db,
  matchId: string,
  expectedSeq: number,
): Promise<void> {
  const { data: match, error } = await db
    .from('matches')
    .select('action_count')
    .eq('id', matchId)
    .maybeSingle()
  if (error) throw new AppError('INTERNAL', error.message)
  if (match && match.action_count !== expectedSeq) {
    throw new AppError('SEQ_CONFLICT', 'Your view is stale; refetch and retry')
  }
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
  assertClientSubmittable(action)
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
  let battleReport: BattleReport | undefined
  try {
    const outcome = applyActionWithOutcome(state, owned)
    next = outcome.state
    battleReport = outcome.battleReport
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

  // Loaded once, after any status flip this call makes to the acting seat
  // (recordMissedTurn/resetActorTurnState above) — the seat->user mapping and
  // status of every OTHER seat stays valid for the rest of this call, so it's
  // safe to reuse for both the AI auto-play loop below and every turn-push
  // dispatch (#158) this call makes.
  const seats = await loadSeats(db, matchId)

  // #158 push + #132 offline email: notify whoever the turn just advanced to,
  // if that's a human seat (both dispatchers no-op for AI/ai_takeover seats,
  // and the email additionally no-ops unless the player has been offline 15+
  // minutes per §6). Best-effort — see their doc comments.
  if (advanced && state.status === 'active') {
    const nextSeat = parseSeat(state.players[state.currentPlayerIndex]!.id)
    await dispatchTurnPush(db, matchId, toTurnSeats(seats), nextSeat)
    await dispatchTurnEmail(db, matchId, toTurnSeats(seats), nextSeat)
  }

  // Auto-play any AI / ai_takeover seats the turn advanced onto (#133).
  while (state.status === 'active') {
    const seat = parseSeat(state.players[state.currentPlayerIndex]!.id)
    const row = seats.find((s) => s.seat === seat)
    const isAi = !row?.user_id || row.status === 'ai_takeover'
    if (!isAi) break
    ;({ state, count } = await runAiSeatTurn(
      db,
      matchId,
      seat,
      match.settings,
      state,
      count,
      seats,
    ))
  }

  await finalize(db, matchId, state)
  await mirrorAllianceIds(db, matchId, state)
  return { seq: count, state, battleReport }
}

/**
 * Mirror the engine's alliance graph (#136/#137) onto the metadata column
 * `match_players.alliance_id` (#140). Each seat's alliance_id becomes the lowest
 * seat number in its connected alliance component (see `allianceComponents`), or
 * null when the seat holds no alliance. The engine's `AllianceState` stays the
 * source of truth for game logic; this column only powers the alliance chat
 * channel's RLS (a seat reads an alliance message iff its *current* alliance_id
 * matches the message's), so a seat that leaves an alliance loses the channel
 * exactly as it loses shared vision (#137). Runs once per accepted submission,
 * writing only the rows whose alliance_id actually changed.
 */
async function mirrorAllianceIds(db: Db, matchId: string, state: GameState): Promise<void> {
  const components = allianceComponents(state.alliances)
  const { data, error } = await db
    .from('match_players')
    .select('seat, alliance_id')
    .eq('match_id', matchId)
  if (error) throw new AppError('INTERNAL', error.message)

  for (const row of data ?? []) {
    const rep = components.get(seatPlayerId(row.seat))
    const allianceId = rep === undefined ? null : parseSeat(rep)
    if (row.alliance_id === allianceId) continue
    const update = await db
      .from('match_players')
      .update({ alliance_id: allianceId })
      .eq('match_id', matchId)
      .eq('seat', row.seat)
    if (update.error) throw new AppError('INTERNAL', update.error.message)
  }
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
  seats: readonly SeatRow[],
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
      // #158 push + #132 offline email: notify the next seat's human
      // occupant, if any (see the call site in submitActionInternal for the
      // full rationale).
      if (state.status === 'active') {
        const nextSeat = parseSeat(state.players[state.currentPlayerIndex]!.id)
        await dispatchTurnPush(db, matchId, toTurnSeats(seats), nextSeat)
        await dispatchTurnEmail(db, matchId, toTurnSeats(seats), nextSeat)
      }
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
    .order('turn_deadline', { ascending: true })
    .limit(MAX_EXPIRED_TURNS_PER_SWEEP)
  if (error) throw new AppError('INTERNAL', error.message)

  const expired: ExpiredTurn[] = []
  for (const row of data ?? []) {
    try {
      const state = await reconstructState(db, row.id, row.action_count)
      if (state.status !== 'active') continue
      expired.push({
        matchId: row.id,
        seat: parseSeat(state.players[state.currentPlayerIndex]!.id),
      })
    } catch (err) {
      // A match that can't be reconstructed (e.g. #216's wedged-match scenario)
      // must never abort the whole sweep — log it and let the rest of the
      // (oldest-first) batch through; this match is retried next run (#225).
      console.error(`sweep-turns: failed to reconstruct match ${row.id}, skipping this run`, err)
    }
  }
  return expired
}

/** Whether a `skipExpiredTurn` failure is an expected race — a human's own
 * submission or a concurrent sweep pass already resolved this match's turn
 * between {@link findExpiredTurns}'s read and the skip call — rather than a
 * genuine bug (#225). The sweep loop logs-and-continues on every failure
 * either way; this only controls whether it also logs loudly as unexpected. */
export function isExpectedSweepRace(err: unknown): boolean {
  return (
    err instanceof AppError &&
    (err.code === 'NOT_YOUR_TURN' || err.code === 'SEQ_CONFLICT' || err.code === 'MATCH_STATE')
  )
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

/** Whether a `get-player-view` caller is a real seat-holder or a granted spectator (#148). */
export type ViewerRole = 'player' | 'spectator'

/** The seat a `get-player-view` caller sees, and by which entitlement. */
export interface Viewer {
  seat: number
  role: ViewerRole
}

/**
 * Resolve which seat's fog-of-war view `userId` is entitled to for `matchId`
 * (#148, docs/MULTIPLAYER.md §12). A seat-holder sees their own seat; otherwise
 * an explicitly-granted spectator sees exactly the one seat their grant pins.
 * Player precedence and the null→`FORBIDDEN` decision both live in the pure,
 * unit-tested {@link resolveViewSeat}; this wrapper only supplies the two DB
 * reads. The returned seat then feeds the SAME `playerView(state, seat)` filter a
 * real player's request uses — that shared code path is what makes a spectator's
 * response byte-identical to the watched seat's own view (the anti-cheat property
 * this issue turns on), not a spectator-specific branch.
 */
export async function viewerSeat(db: Db, matchId: string, userId: string): Promise<Viewer> {
  const { data: player, error: playerErr } = await db
    .from('match_players')
    .select('seat')
    .eq('match_id', matchId)
    .eq('user_id', userId)
    .maybeSingle()
  if (playerErr) throw new AppError('INTERNAL', playerErr.message)

  const { data: spectator, error: specErr } = await db
    .from('match_spectators')
    .select('viewing_seat')
    .eq('match_id', matchId)
    .eq('user_id', userId)
    .maybeSingle()
  if (specErr) throw new AppError('INTERNAL', specErr.message)

  const seat = resolveViewSeat(player?.seat ?? null, spectator?.viewing_seat ?? null)
  if (seat === null) {
    throw new AppError('FORBIDDEN', 'You do not hold a seat or spectator grant in this match')
  }
  return { seat, role: player ? 'player' : 'spectator' }
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
  // Diplomacy knobs (#177). Defaults mirror @aop/content's GAME_SETUP so a client
  // that omits them gets the same match the fixed content defaults produced before
  // these became host-configurable. Bounds match the NewGameSetup sliders
  // (apps/web/src/screens/NewGameSetup.tsx): 0..100 reputation cost, 0..10 rounds.
  const betrayalReputationPenalty =
    s.betrayalReputationPenalty === undefined ? 40 : Number(s.betrayalReputationPenalty)
  if (
    !Number.isInteger(betrayalReputationPenalty) ||
    betrayalReputationPenalty < 0 ||
    betrayalReputationPenalty > 100
  ) {
    throw new AppError(
      'BAD_REQUEST',
      'settings.betrayalReputationPenalty must be an integer 0..100',
    )
  }
  const betrayalTruceRounds =
    s.betrayalTruceRounds === undefined ? 2 : Number(s.betrayalTruceRounds)
  if (
    !Number.isInteger(betrayalTruceRounds) ||
    betrayalTruceRounds < 0 ||
    betrayalTruceRounds > 10
  ) {
    throw new AppError('BAD_REQUEST', 'settings.betrayalTruceRounds must be an integer 0..10')
  }
  return {
    mapSize,
    maxPlayers,
    aiSeats,
    turnTimerSeconds: s.turnTimerSeconds === null ? null : turnTimerSeconds,
    private: Boolean(s.private),
    missedTurnThreshold: threshold,
    betrayalReputationPenalty,
    betrayalTruceRounds,
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
