import { addResources, canAfford, subtractResources } from '@aop/shared'
import { InvalidActionError, type Action, type ConstructBuildingAction } from './actions'
import type { ContentCatalog } from './content'
import { playerIncome } from './economy'
import { currentPlayer } from './game'
import type { GameState } from './types'

/**
 * The single entry point for mutating game state. Pure: returns a new state,
 * never touches the input. Throws InvalidActionError for illegal actions —
 * the server rejects these; a well-behaved client never produces them.
 *
 * `catalog` supplies balance data (building/unit/ship defs, ...) from
 * @aop/content — the engine package itself stays dependency-free.
 */
export function applyAction(state: GameState, action: Action, catalog: ContentCatalog): GameState {
  if (state.status !== 'active') {
    throw new InvalidActionError('Game is over', action)
  }
  if (currentPlayer(state).id !== action.playerId) {
    throw new InvalidActionError(`Not ${action.playerId}'s turn`, action)
  }

  let next: GameState
  switch (action.type) {
    case 'endTurn':
      next = advanceTurn(state, catalog)
      break
    case 'resign':
      next = advanceTurn(eliminatePlayer(state, action.playerId), catalog)
      break
    case 'construct':
      next = construct(state, action, catalog)
      break
  }

  return { ...next, actionCount: state.actionCount + 1 }
}

function construct(
  state: GameState,
  action: ConstructBuildingAction,
  catalog: ContentCatalog,
): GameState {
  const city = state.cities.find((c) => c.id === action.cityId)
  if (!city || city.ownerId !== action.playerId) {
    throw new InvalidActionError(`No city ${action.cityId} owned by ${action.playerId}`, action)
  }
  if (city.builtThisRound) {
    throw new InvalidActionError(`${city.id} has already built this turn`, action)
  }
  if (city.buildings.includes(action.buildingId)) {
    throw new InvalidActionError(`${city.id} already has ${action.buildingId}`, action)
  }
  const def = catalog.buildings[action.buildingId]
  if (!def) {
    throw new InvalidActionError(`Unknown building ${action.buildingId}`, action)
  }
  if (def.requires && !city.buildings.includes(def.requires)) {
    throw new InvalidActionError(`${action.buildingId} requires ${def.requires} first`, action)
  }
  const player = state.players.find((p) => p.id === action.playerId)!
  if (!canAfford(player.resources, def.cost)) {
    throw new InvalidActionError(`${action.playerId} cannot afford ${action.buildingId}`, action)
  }

  return {
    ...state,
    players: state.players.map((p) =>
      p.id === action.playerId ? { ...p, resources: subtractResources(p.resources, def.cost) } : p,
    ),
    cities: state.cities.map((c) =>
      c.id === city.id
        ? { ...c, buildings: [...c.buildings, action.buildingId], builtThisRound: true }
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

function advanceTurn(state: GameState, catalog: ContentCatalog): GameState {
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

  const roundAdvanced = round !== state.round
  const players = roundAdvanced
    ? state.players.map((p) =>
        p.eliminated
          ? p
          : { ...p, resources: addResources(p.resources, playerIncome(state, p.id, catalog)) },
      )
    : state.players

  const cities = roundAdvanced
    ? state.cities.map((c) => ({ ...c, builtThisRound: false }))
    : state.cities

  return { ...state, currentPlayerIndex: index, round, players, cities }
}

/** Replay an action log against a fresh state — used for loads, replays, and audits. */
export function replay(
  initial: GameState,
  actions: readonly Action[],
  catalog: ContentCatalog,
): GameState {
  return actions.reduce((state, action) => applyAction(state, action, catalog), initial)
}
