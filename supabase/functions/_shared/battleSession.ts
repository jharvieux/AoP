// Binding battle sessions (#408, #321) — the transport layer for multiplayer
// interactive combat. Design: docs/design/multiplayer-tactical-probe.md §2 (session
// flow), §2.2 (BATTLE_PENDING mutual exclusion), §3 (API + storage), §10 (two-seat).
//
// The server holds the in-progress per-round order prefix in `match_battle_sessions`,
// re-runs the PURE engine probe (`probeTacticalBattle`, @aop/engine) against the
// authoritative state on every round, and appends the SINGLE `attackCaptain` action to
// `match_actions` only when the battle resolves. The action log, replay contract, engine
// purity, and snapshot/compaction machinery are all untouched (§2.3): a finished match's
// log is indistinguishable from one where the attacker precomputed the whole plan.
//
// Anti-cheat boundary (§2.3, §10.6): a session NEVER stores a `GameState` or `rngState`;
// it stores only the recorded order lists, re-deriving everything from snapshot + log each
// round. What leaves per round is `TacticContext` / `BoardActivationView` — the engine's
// own documented symmetric, hidden-info-free views. The raw session row is service-role
// only (RLS deny-all, #407) and never returned; only the per-seat probe outcome is.
//
// Two-seat scope note (§10, D-029): the schema (#407) and the resolver here are two-seat —
// the DEFENDER's own recorded picks (`defender_tactic_orders`/`defender_board_commands`)
// are carried into the one logged `attackCaptain` via its server-authored
// `defenderOrders`/`defenderBoardCommands` fields (#418) and honored at resolution, and
// `battle-round` accepts either seat. The remaining live-simultaneity slice — the engine
// two-seat `AwaitingTactics` collect-pass that hands a LIVE defender its own per-round
// `awaitingTactic` context under blind one-round-ahead lockstep (`awaitingCounterpart`,
// `BATTLE_ROUND_PENDING`), plus presence poking and the per-round grace clock — is deferred
// to #422 (it needs the risky core-combat `resolveTacticalCombat` change plus two live
// clients to verify). Until then the ATTACKER drives the naval probe round-by-round and the
// defender's recorded picks count at resolution; an un-recorded defender round is filled by
// its standing orders → AI, exactly as async play does today.

import {
  applyAction,
  InvalidActionError,
  playerView,
  probeTacticalBattle,
  TACTICS,
  type AttackCaptainAction,
  type BattleReport,
  type BoardActivationView,
  type BoardCommand,
  type GameState,
  type PlayerView,
  type TacticContext,
  type TacticId,
} from '@aop/engine'
import type { Database, Json } from '@aop/shared'
import type { Db } from './client.ts'
import { AppError } from './http.ts'
import {
  parseSeat,
  reconstructState,
  reqBoardCommand,
  seatPlayerId,
  submitActionInternal,
} from './match.ts'

/**
 * Whole-battle wall-clock budget (§10.5, D-028): the hard cap across BOTH seats for the
 * entire interactive battle, stored as `deadline`. Config with a 5-minute default in the
 * operator's approved [3,5]-minute band. Bounded further by the attacker's remaining turn
 * time (`min(remaining turn time, this)`), so a battle never outlives the turn it began in.
 * The `sweep-turns` cron force-resolves a session past this cap before its turn-skip logic.
 */
export const WHOLE_BATTLE_DEADLINE_SECONDS = 300

/** A tactic order or a board (melee) command — the two order kinds a `battle-round` carries. */
export type BattleOrder = { tactic: TacticId } | { boardCommand: BoardCommand }

/**
 * The per-seat outcome returned by every session endpoint. Mirrors the engine's
 * `TacticalProbeOutcome` (@aop/engine) plus the transport-level `resolved`/`recorded`
 * cases. NEVER carries `rngState`, the raw session row, or the counterpart seat's recorded
 * order bytes (§7/§10.6 leak audit) — `ctx`/`view` are the engine's symmetric views, and
 * `resolved.view` is the caller's own fog-filtered `PlayerView`.
 */
export type BattleSessionOutcome =
  | { kind: 'awaitingTactic'; ctx: TacticContext }
  | { kind: 'awaitingCommand'; view: BoardActivationView }
  | { kind: 'recorded'; tacticOrders: number; boardCommands: number }
  | { kind: 'resolved'; seq: number; view: PlayerView; battleReport: BattleReport }

/** The `match_battle_sessions` row, with the jsonb columns typed as their engine arrays. */
interface SessionRow {
  match_id: string
  attacker_seat: number
  defender_seat: number
  base_seq: number
  captain_id: string
  target_captain_id: string
  attacker_tactic_orders: TacticId[]
  defender_tactic_orders: TacticId[]
  attacker_board_commands: BoardCommand[]
  defender_board_commands: BoardCommand[]
  defender_interactive: boolean
  round_deadline: string | null
  deadline: string
}

/** The `matches` columns a session open needs, read in one query. */
interface MatchLite {
  status: string
  action_count: number
  turn_deadline: string | null
}

async function loadMatchLite(db: Db, matchId: string): Promise<MatchLite> {
  const { data, error } = await db
    .from('matches')
    .select('status, action_count, turn_deadline')
    .eq('id', matchId)
    .maybeSingle()
  if (error) throw new AppError('INTERNAL', error.message)
  if (!data) throw new AppError('NOT_FOUND', 'No such match')
  return data as unknown as MatchLite
}

async function loadSession(db: Db, matchId: string): Promise<SessionRow | null> {
  const { data, error } = await db
    .from('match_battle_sessions')
    .select('*')
    .eq('match_id', matchId)
    .maybeSingle()
  if (error) throw new AppError('INTERNAL', error.message)
  return (data as unknown as SessionRow) ?? null
}

async function deleteSession(db: Db, matchId: string): Promise<void> {
  const { error } = await db.from('match_battle_sessions').delete().eq('match_id', matchId)
  if (error) throw new AppError('INTERNAL', error.message)
}

/** The whole-battle deadline: the config cap, clamped to the attacker's remaining turn time. */
function battleDeadline(turnDeadline: string | null): string {
  const cap = Date.now() + WHOLE_BATTLE_DEADLINE_SECONDS * 1000
  const turnMs = turnDeadline ? Date.parse(turnDeadline) : Number.POSITIVE_INFINITY
  return new Date(Math.min(cap, turnMs)).toISOString()
}

/** Assemble the single `attackCaptain` action a session resolves to. Omits empty order
 * lists so the logged action is byte-shaped exactly like a precomputed attack (§2.3):
 * absent `attackerOrders` means the attacker never opened a plan, and absent
 * `defenderOrders` means the defender is driven by its standing orders (today's default). */
function buildAttackAction(session: SessionRow): AttackCaptainAction {
  return {
    type: 'attackCaptain',
    playerId: seatPlayerId(session.attacker_seat),
    captainId: session.captain_id,
    targetCaptainId: session.target_captain_id,
    ...(session.attacker_tactic_orders.length
      ? { attackerOrders: session.attacker_tactic_orders }
      : {}),
    ...(session.attacker_board_commands.length
      ? { boardCommands: session.attacker_board_commands }
      : {}),
    ...(session.defender_tactic_orders.length
      ? { defenderOrders: session.defender_tactic_orders }
      : {}),
    ...(session.defender_board_commands.length
      ? { defenderBoardCommands: session.defender_board_commands }
      : {}),
  }
}

/** Run the pure engine probe for the attacker's recorded prefix against `state`, wiring the
 * defender's recorded picks (or its standing-orders fallback) exactly as the reducer will at
 * resolution — this shared construction is what makes "server probe outcome == final applied
 * battle report for the same prefix" hold (§8 PR-3 probe-parity guarantee). */
function probeSession(state: GameState, session: SessionRow) {
  return probeTacticalBattle(
    state,
    { captainId: session.captain_id, targetCaptainId: session.target_captain_id },
    session.attacker_tactic_orders,
    session.attacker_board_commands,
    {
      tacticOrders: session.defender_tactic_orders,
      boardCommands: session.defender_board_commands,
    },
  )
}

/**
 * Push a session's assembled `attackCaptain` through the SAME `submitActionInternal`
 * pipeline every attack uses (append, snapshot, notifications, AI auto-play, finalize —
 * all unchanged, §2.1 step 3), then delete the session. Resolution rides the existing
 * `append_match_action` CAS at `base_seq + 1`, so a session opened against a state that
 * somehow advanced (deploy skew, sweep race) fails as `SEQ_CONFLICT`, never as a desynced
 * battle (§3.1) — and on that conflict we delete the now-stale session so the match is never
 * left wedged behind a `BATTLE_PENDING` guard. Bypasses `assertClientSubmittable` (the
 * client guard) deliberately: the assembled action is server-authored and legitimately
 * carries the defender's `defenderOrders`/`defenderBoardCommands`.
 */
async function submitAndClear(
  db: Db,
  matchId: string,
  session: SessionRow,
): Promise<{ kind: 'resolved'; seq: number; view: PlayerView; battleReport: BattleReport }> {
  const attackerPlayerId = seatPlayerId(session.attacker_seat)
  try {
    const { seq, state, battleReport } = await submitActionInternal(
      db,
      matchId,
      session.attacker_seat,
      buildAttackAction(session),
      { skip: false },
    )
    await deleteSession(db, matchId)
    return {
      kind: 'resolved',
      seq,
      view: playerView(state, attackerPlayerId),
      // The action IS an attack, so `submitActionInternal` always returns the report.
      battleReport: battleReport as BattleReport,
    }
  } catch (err) {
    if (err instanceof AppError && err.code === 'SEQ_CONFLICT') {
      await deleteSession(db, matchId)
    }
    throw err
  }
}

/** Reconstruct state, run the probe, and either resolve (append the action) or hand back the
 * next awaiting context. Shared by open, round, and the idempotent resume. */
async function outcomeFor(
  db: Db,
  matchId: string,
  session: SessionRow,
): Promise<BattleSessionOutcome> {
  const state = await reconstructState(db, matchId, session.base_seq)
  const probe = probeSession(state, session)
  if (probe.kind === 'resolved') return submitAndClear(db, matchId, session)
  return probe
}

function parseOrder(value: unknown): BattleOrder {
  if (typeof value !== 'object' || value === null) {
    throw new AppError('BAD_REQUEST', 'order must be a { tactic } or { boardCommand } object')
  }
  const v = value as Record<string, unknown>
  if (v.tactic !== undefined) {
    if (typeof v.tactic !== 'string' || !(TACTICS as readonly string[]).includes(v.tactic)) {
      throw new AppError('BAD_REQUEST', `order.tactic must be one of: ${TACTICS.join(', ')}`)
    }
    return { tactic: v.tactic as TacticId }
  }
  if (v.boardCommand !== undefined) {
    return { boardCommand: reqBoardCommand(v.boardCommand, 'order.boardCommand') }
  }
  throw new AppError('BAD_REQUEST', 'order must carry either a tactic or a boardCommand')
}

// --- Public API used by the three edge functions and sweep-turns ---

export interface OpenBattleRequest {
  expectedSeq: number
  captainId: string
  targetCaptainId: string
}

/**
 * Open (binding, §2.1 step 1). Validates seat/turn/seq and the attack's preconditions
 * (adjacency, movement, ownership, not-captured) via the reducer's OWN validation — a
 * throwaway `applyAction` dry-run, discarded — then writes the session row. From this moment
 * the attack is committed: abandoning the session does not cancel the battle. Idempotent for
 * the SAME attack (reconnect/resume returns the current context, §2.1 step 5); a DIFFERENT
 * attack while one is open is `BATTLE_PENDING`.
 */
export async function openBattleSession(
  db: Db,
  matchId: string,
  seat: number,
  req: OpenBattleRequest,
): Promise<{ seq: number; outcome: BattleSessionOutcome }> {
  const match = await loadMatchLite(db, matchId)
  if (match.status !== 'active') throw new AppError('MATCH_STATE', `Match is ${match.status}`)
  if (match.action_count !== req.expectedSeq) {
    throw new AppError('SEQ_CONFLICT', 'Your view is stale; refetch and retry')
  }

  const state = await reconstructState(db, matchId, match.action_count)
  const attackerPlayerId = seatPlayerId(seat)
  if (state.players[state.currentPlayerIndex]?.id !== attackerPlayerId) {
    throw new AppError('NOT_YOUR_TURN', 'It is not your turn')
  }

  const existing = await loadSession(db, matchId)
  if (existing) {
    if (
      existing.attacker_seat !== seat ||
      existing.captain_id !== req.captainId ||
      existing.target_captain_id !== req.targetCaptainId
    ) {
      throw new AppError('BATTLE_PENDING', 'A different battle is already in progress')
    }
    return { seq: existing.base_seq, outcome: await outcomeFor(db, matchId, existing) }
  }

  // Precondition validation through the reducer (adjacency/movement/ownership/not-captured):
  // the empty-orders attack either applies cleanly or throws InvalidActionError. The result
  // is discarded — we only want the throw-or-not; the real resolution happens later.
  try {
    applyAction(state, {
      type: 'attackCaptain',
      playerId: attackerPlayerId,
      captainId: req.captainId,
      targetCaptainId: req.targetCaptainId,
    })
  } catch (err) {
    if (err instanceof InvalidActionError) throw new AppError('INVALID_ACTION', err.message)
    throw err
  }

  const target = state.captains.find((c) => c.id === req.targetCaptainId)!
  const insert = {
    match_id: matchId,
    attacker_seat: seat,
    defender_seat: parseSeat(target.ownerId),
    base_seq: match.action_count,
    captain_id: req.captainId,
    target_captain_id: req.targetCaptainId,
    deadline: battleDeadline(match.turn_deadline),
  }
  const { error } = await db.from('match_battle_sessions').insert(insert)
  if (error) {
    // A racing open for this match lost the PK — reload and resume/BATTLE_PENDING the winner.
    if (error.code === '23505') return openBattleSession(db, matchId, seat, req)
    throw new AppError('INTERNAL', error.message)
  }

  const session = await loadSession(db, matchId)
  if (!session) throw new AppError('INTERNAL', 'Session vanished immediately after insert')
  return { seq: session.base_seq, outcome: await outcomeFor(db, matchId, session) }
}

/**
 * Append one order under a per-side length CAS (§2.1 step 2, §10.3). The caller's seat
 * (attacker or defender) selects which side's list is extended; a non-participant is
 * `NOT_A_PARTICIPANT`. `expectedOrders` guards the length of the list being appended to
 * (tactic list for a tactic, board list for a board command), so a rapid double-submit gets
 * a deterministic `ORDERS_CONFLICT` — the server-side fix for the #293 client race.
 *
 * After an ATTACKER append the probe re-runs and returns the next awaiting context (or the
 * resolution); a DEFENDER append is acknowledged as `recorded` (its picks count at
 * resolution — the live per-round defender context is #422, see the file header).
 */
export async function appendBattleOrder(
  db: Db,
  matchId: string,
  seat: number,
  expectedOrders: number,
  rawOrder: unknown,
): Promise<BattleSessionOutcome> {
  const session = await loadSession(db, matchId)
  if (!session) throw new AppError('MATCH_STATE', 'No battle is in progress for this match')

  const side =
    seat === session.attacker_seat ? 'attacker' : seat === session.defender_seat ? 'defender' : null
  if (!side) throw new AppError('NOT_A_PARTICIPANT', 'You are not a participant in this battle')

  const order = parseOrder(rawOrder)
  const tacticCol = `${side}_tactic_orders` as const
  const boardCol = `${side}_board_commands` as const
  const tactics = session[tacticCol]
  const commands = session[boardCol]

  // Per-side length CAS. A tactic extends the tactic list; a board command the board list.
  const isTactic = 'tactic' in order
  const currentLength = isTactic ? tactics.length : commands.length
  if (currentLength !== expectedOrders) {
    throw new AppError('ORDERS_CONFLICT', 'Your recorded orders are stale; refetch and retry')
  }

  const patch: Database['public']['Tables']['match_battle_sessions']['Update'] = {}
  if (isTactic) {
    patch[tacticCol] = [...tactics, order.tactic] as unknown as Json
  } else {
    patch[boardCol] = [...commands, order.boardCommand] as unknown as Json
  }
  if (side === 'defender') patch.defender_interactive = true

  const { error } = await db.from('match_battle_sessions').update(patch).eq('match_id', matchId)
  if (error) throw new AppError('INTERNAL', error.message)

  if (side === 'defender') {
    return {
      kind: 'recorded',
      tacticOrders: isTactic ? tactics.length + 1 : tactics.length,
      boardCommands: isTactic ? commands.length : commands.length + 1,
    }
  }
  const updated = await loadSession(db, matchId)
  if (!updated) throw new AppError('INTERNAL', 'Session vanished mid-round')
  return outcomeFor(db, matchId, updated)
}

/**
 * The auto-fight escape hatch (§2.1 step 4, attacker-only per §10.5): force-resolve
 * immediately from the orders recorded so far. The engine's deterministic fallbacks complete
 * each side's tail from the logged action alone — the attacker's `tacticPlanDriver` cyclically
 * wraps its recorded naval plan (`broadside` if empty), the defender falls back to standing
 * orders → doctrine → AI (asymmetric per D-029 §10.5) — so no new engine semantics are needed.
 */
export async function autoResolveBattleSession(
  db: Db,
  matchId: string,
  seat: number,
): Promise<{ kind: 'resolved'; seq: number; view: PlayerView; battleReport: BattleReport }> {
  const session = await loadSession(db, matchId)
  if (!session) throw new AppError('MATCH_STATE', 'No battle is in progress for this match')
  if (seat !== session.attacker_seat) {
    throw new AppError('NOT_A_PARTICIPANT', 'Only the attacker may force-resolve a battle')
  }
  return submitAndClear(db, matchId, session)
}

/** Per-seat context read (§10.7) so the defender (who never saw the `battle-open` response)
 * or either seat on reconnect can fetch the current outcome without recording an order. */
export async function battleContext(
  db: Db,
  matchId: string,
  seat: number,
): Promise<BattleSessionOutcome> {
  const session = await loadSession(db, matchId)
  if (!session) throw new AppError('MATCH_STATE', 'No battle is in progress for this match')
  if (seat !== session.attacker_seat && seat !== session.defender_seat) {
    throw new AppError('NOT_A_PARTICIPANT', 'You are not a participant in this battle')
  }
  return outcomeFor(db, matchId, session)
}

/**
 * BATTLE_PENDING guard (§2.2): reject a state-advancing action (`submit-action`/`end-turn`)
 * while a session is open for the ATTACKER's seat — any other action would advance state
 * underneath the session's recorded prefix and desync it. Sessions belong to the current
 * seat and die with the turn, so this blocks nobody but the attacker themself; a defender's
 * interaction advances no match state and needs no guard (§10.7). Read paths are unaffected.
 */
export async function assertNoBattlePending(db: Db, matchId: string, seat: number): Promise<void> {
  const session = await loadSession(db, matchId)
  if (session && session.attacker_seat === seat) {
    throw new AppError('BATTLE_PENDING', 'Finish or auto-resolve your battle before acting')
  }
}

/**
 * The `match_ids` of sessions past their whole-battle `deadline` (§2.1 step 5). The
 * `sweep-turns` cron force-resolves each BEFORE its normal turn-skip logic, so a player who
 * disconnects mid-battle costs the match at most one session deadline and their recorded
 * rounds still count.
 */
export async function findExpiredBattleSessions(db: Db): Promise<string[]> {
  const { data, error } = await db
    .from('match_battle_sessions')
    .select('match_id')
    .lt('deadline', new Date().toISOString())
  if (error) throw new AppError('INTERNAL', error.message)
  return (data ?? []).map((r) => (r as { match_id: string }).match_id)
}

/** Force-resolve one expired session, exactly like `battle-auto` (§2.1 step 5). */
export async function forceResolveExpiredSession(db: Db, matchId: string): Promise<number> {
  const session = await loadSession(db, matchId)
  if (!session) throw new AppError('MATCH_STATE', 'Session already resolved')
  const { seq } = await submitAndClear(db, matchId, session)
  return seq
}
