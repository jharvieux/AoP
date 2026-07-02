import { chebyshevDistance } from '@aop/shared'
import {
  InvalidActionError,
  type Action,
  type AttackCaptainAction,
  type MoveCaptainAction,
} from './actions'
import {
  createCombatStats,
  resolveCombat,
  type BattleReport,
  type Combatant,
  type CombatResult,
} from './combat'
import { currentPlayer } from './game'
import { tileAt } from './map'
import { findPath } from './pathfinding'
import type { Captain, GameState } from './types'

/**
 * Optional structured result of the last action, surfaced to the client without
 * living in the (replayable) GameState. Currently only combat produces one.
 */
export interface ActionOutcome {
  state: GameState
  battleReport?: BattleReport
}

/**
 * The single entry point for mutating game state. Pure: returns a new state,
 * never touches the input. Throws InvalidActionError for illegal actions —
 * the server rejects these; a well-behaved client never produces them.
 */
export function applyAction(state: GameState, action: Action): GameState {
  return applyActionWithOutcome(state, action).state
}

/**
 * Like {@link applyAction}, but also returns any structured side output (e.g. a
 * combat {@link BattleReport}) for the client to display. The report is fully
 * derived from the pre-action RNG state, so replays reproduce it exactly.
 */
export function applyActionWithOutcome(state: GameState, action: Action): ActionOutcome {
  if (state.status !== 'active') {
    throw new InvalidActionError('Game is over', action)
  }
  if (currentPlayer(state).id !== action.playerId) {
    throw new InvalidActionError(`Not ${action.playerId}'s turn`, action)
  }

  let next: GameState
  let battleReport: BattleReport | undefined
  switch (action.type) {
    case 'endTurn':
      next = advanceTurn(state)
      break
    case 'resign':
      next = advanceTurn(eliminatePlayer(state, action.playerId))
      break
    case 'moveCaptain':
      next = moveCaptain(state, action)
      break
    case 'attackCaptain': {
      const result = attackCaptain(state, action)
      next = result.state
      battleReport = result.battleReport
      break
    }
  }

  const outcome: ActionOutcome = { state: { ...next, actionCount: state.actionCount + 1 } }
  if (battleReport) outcome.battleReport = battleReport
  return outcome
}

function moveCaptain(state: GameState, action: MoveCaptainAction): GameState {
  const captain = state.captains.find((c) => c.id === action.captainId)
  if (!captain) throw new InvalidActionError(`No captain ${action.captainId}`, action)
  if (captain.ownerId !== action.playerId) {
    throw new InvalidActionError(`Captain ${action.captainId} is not yours`, action)
  }
  if (!tileAt(state.map, action.to)) {
    throw new InvalidActionError(`Destination ${action.to.x},${action.to.y} is off-map`, action)
  }

  const path = findPath(state.map, captain.position, action.to)
  if (!path) throw new InvalidActionError('Destination is not reachable by sea', action)

  const cost = path.length - 1
  if (cost > captain.movementPoints) {
    throw new InvalidActionError(
      `Move costs ${cost} but captain has ${captain.movementPoints} movement`,
      action,
    )
  }

  return {
    ...state,
    captains: state.captains.map((c) =>
      c.id === captain.id
        ? { ...c, position: { ...action.to }, movementPoints: c.movementPoints - cost }
        : c,
    ),
  }
}

function eliminatePlayer(state: GameState, playerId: string): GameState {
  return {
    ...state,
    players: state.players.map((p) => (p.id === playerId ? { ...p, eliminated: true } : p)),
  }
}

/**
 * The combat resolver used by {@link attackCaptain}. Held in a module variable so
 * the Phase-2 tactical layer (#18) can install a richer resolver over the exact
 * same action path without editing this file. Defaults to v1 auto-resolve.
 */
let combatResolver = resolveCombat

/** Install the combat resolver used for `attackCaptain`. See #18. */
export function setCombatResolver(resolver: typeof resolveCombat): void {
  combatResolver = resolver
}

function attackCaptain(
  state: GameState,
  action: AttackCaptainAction,
): { state: GameState; battleReport: BattleReport } {
  const attacker = state.captains.find((c) => c.id === action.captainId)
  if (!attacker) throw new InvalidActionError(`No captain ${action.captainId}`, action)
  if (attacker.ownerId !== action.playerId) {
    throw new InvalidActionError(`Captain ${action.captainId} is not yours`, action)
  }
  const target = state.captains.find((c) => c.id === action.targetCaptainId)
  if (!target) throw new InvalidActionError(`No captain ${action.targetCaptainId}`, action)
  if (target.ownerId === action.playerId) {
    throw new InvalidActionError('Cannot attack your own captain', action)
  }
  if (chebyshevDistance(attacker.position, target.position) > 1) {
    throw new InvalidActionError('Target is not within attack range', action)
  }
  if (attacker.movementPoints < 1) {
    throw new InvalidActionError('Captain has no movement left to attack', action)
  }
  if (!state.config.combatStats) {
    throw new InvalidActionError('No combat stats configured for this match', action)
  }

  const stats = createCombatStats(state.config.combatStats)
  const toCombatant = (c: Captain): Combatant => ({
    captainId: c.id,
    ownerId: c.ownerId,
    shipClassId: c.shipClassId,
    troops: c.troops,
  })

  const result: CombatResult = combatResolver(
    { attacker: toCombatant(attacker), defender: toCombatant(target) },
    stats,
    state.rngState,
  )
  const { report } = result

  // Write back survivors: sink defeated captains, update troops on survivors,
  // and spend the attacker's movement for the turn.
  const captains = state.captains
    .filter((c) => {
      if (c.id === attacker.id) return report.attackerSurvived
      if (c.id === target.id) return report.defenderSurvived
      return true
    })
    .map((c) => {
      if (c.id === attacker.id) {
        return { ...c, troops: result.attackerTroops, movementPoints: 0 }
      }
      if (c.id === target.id) return { ...c, troops: result.defenderTroops }
      return c
    })

  const settled = settleEliminations({ ...state, captains, rngState: result.rng })
  return { state: settled, battleReport: report }
}

/**
 * After a battle: any player with no captains left is eliminated, the game ends
 * if one (or none) remains, and if the acting player was just eliminated the turn
 * advances so play can continue.
 */
function settleEliminations(state: GameState): GameState {
  const withElims: GameState = {
    ...state,
    players: state.players.map((p) =>
      !p.eliminated && !state.captains.some((c) => c.ownerId === p.id)
        ? { ...p, eliminated: true }
        : p,
    ),
  }

  const alive = withElims.players.filter((p) => !p.eliminated)
  if (alive.length <= 1) {
    return { ...withElims, status: 'finished', winnerId: alive[0]?.id ?? null }
  }
  if (withElims.players[withElims.currentPlayerIndex]!.eliminated) {
    return advanceTurn(withElims)
  }
  return withElims
}

function advanceTurn(state: GameState): GameState {
  const alive = state.players.filter((p) => !p.eliminated)
  if (alive.length <= 1) {
    return {
      ...state,
      status: 'finished',
      winnerId: alive[0]?.id ?? null,
    }
  }

  let index = state.currentPlayerIndex
  let round = state.round
  do {
    index += 1
    if (index >= state.players.length) {
      index = 0
      round += 1
    }
  } while (state.players[index]!.eliminated)

  return refreshMovement({ ...state, currentPlayerIndex: index, round }, state.players[index]!.id)
}

/** Restore a player's captains to full movement at the start of their turn. */
function refreshMovement(state: GameState, playerId: string): GameState {
  return {
    ...state,
    captains: state.captains.map((c) =>
      c.ownerId === playerId ? { ...c, movementPoints: c.maxMovementPoints } : c,
    ),
  }
}

/** Replay an action log against a fresh state — used for loads, replays, and audits. */
export function replay(initial: GameState, actions: readonly Action[]): GameState {
  return actions.reduce(applyAction, initial)
}
