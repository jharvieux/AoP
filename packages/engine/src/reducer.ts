import { InvalidActionError, type Action, type MoveCaptainAction } from './actions'
import { currentPlayer } from './game'
import { tileAt } from './map'
import { findPath } from './pathfinding'
import type { GameState } from './types'

/**
 * The single entry point for mutating game state. Pure: returns a new state,
 * never touches the input. Throws InvalidActionError for illegal actions —
 * the server rejects these; a well-behaved client never produces them.
 */
export function applyAction(state: GameState, action: Action): GameState {
  if (state.status !== 'active') {
    throw new InvalidActionError('Game is over', action)
  }
  if (currentPlayer(state).id !== action.playerId) {
    throw new InvalidActionError(`Not ${action.playerId}'s turn`, action)
  }

  let next: GameState
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
  }

  return { ...next, actionCount: state.actionCount + 1 }
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
