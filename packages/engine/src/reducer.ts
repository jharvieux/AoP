import { addResources, canAfford, subtractResources } from '@aop/shared'
import {
  InvalidActionError,
  type Action,
  type ConstructBuildingAction,
  type RecruitUnitAction,
  type SetStandingOrderAction,
  type TransferTroopsAction,
} from './actions'
import type { ContentCatalog } from './content'
import { playerIncome, replenishAvailability, unlockedRecruitTier } from './economy'
import { currentPlayer } from './game'
import type { GameState } from './types'
import { accumulateExploredTiles } from './visibility'

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
    case 'recruit':
      next = recruit(state, action, catalog)
      break
    case 'transferTroops':
      next = transferTroops(state, action, catalog)
      break
    case 'setStandingOrder':
      next = setStandingOrder(state, action)
      break
  }

  // Fold newly-visible tiles into the acting player's exploration history.
  // Cheap and idempotent today (cities are static); it starts earning its
  // keep once captains gain map positions and can move (#8).
  next = {
    ...next,
    exploredTiles: {
      ...next.exploredTiles,
      [action.playerId]: accumulateExploredTiles(next, action.playerId),
    },
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

function recruit(state: GameState, action: RecruitUnitAction, catalog: ContentCatalog): GameState {
  if (action.count <= 0) {
    throw new InvalidActionError('Recruit count must be positive', action)
  }
  const city = state.cities.find((c) => c.id === action.cityId)
  if (!city || city.ownerId !== action.playerId) {
    throw new InvalidActionError(`No city ${action.cityId} owned by ${action.playerId}`, action)
  }
  const player = state.players.find((p) => p.id === action.playerId)!
  const def = catalog.units[action.unitId]
  if (!def || def.factionId !== player.faction) {
    throw new InvalidActionError(`${action.unitId} is not recruitable by ${player.faction}`, action)
  }
  if (def.tier > unlockedRecruitTier(city, catalog)) {
    throw new InvalidActionError(`${city.id} has not unlocked tier ${def.tier} recruits`, action)
  }
  const available = city.unitAvailability[action.unitId] ?? 0
  if (action.count > available) {
    throw new InvalidActionError(`Only ${available} ${action.unitId} available to recruit`, action)
  }
  const cost = { gold: def.goldCost * action.count }
  if (!canAfford(player.resources, cost)) {
    throw new InvalidActionError(
      `${action.playerId} cannot afford ${action.count} ${action.unitId}`,
      action,
    )
  }

  return {
    ...state,
    players: state.players.map((p) =>
      p.id === action.playerId ? { ...p, resources: subtractResources(p.resources, cost) } : p,
    ),
    cities: state.cities.map((c) =>
      c.id === city.id
        ? {
            ...c,
            unitAvailability: { ...c.unitAvailability, [action.unitId]: available - action.count },
            garrison: {
              ...c.garrison,
              [action.unitId]: (c.garrison[action.unitId] ?? 0) + action.count,
            },
          }
        : c,
    ),
  }
}

/**
 * Moves troops between a city's garrison and a visiting captain's ship.
 * Does not yet check that the captain is actually at the city's location —
 * captain map positions land with world map generation (#8); until then,
 * ownership is the only gate.
 */
function transferTroops(
  state: GameState,
  action: TransferTroopsAction,
  catalog: ContentCatalog,
): GameState {
  if (action.count <= 0) {
    throw new InvalidActionError('Transfer count must be positive', action)
  }
  const city = state.cities.find((c) => c.id === action.cityId)
  if (!city || city.ownerId !== action.playerId) {
    throw new InvalidActionError(`No city ${action.cityId} owned by ${action.playerId}`, action)
  }
  const captain = state.captains.find((c) => c.id === action.captainId)
  if (!captain || captain.ownerId !== action.playerId) {
    throw new InvalidActionError(
      `No captain ${action.captainId} owned by ${action.playerId}`,
      action,
    )
  }

  const garrisonCount = city.garrison[action.unitId] ?? 0
  const aboardCount = captain.troopsAboard[action.unitId] ?? 0

  if (action.direction === 'toShip') {
    if (action.count > garrisonCount) {
      throw new InvalidActionError(`${city.id} garrison has only ${garrisonCount} to send`, action)
    }
    const shipClass = catalog.ships[captain.shipClassId]
    const currentAboard = Object.values(captain.troopsAboard).reduce((sum, n) => sum + n, 0)
    if (shipClass && currentAboard + action.count > shipClass.crewCapacity) {
      throw new InvalidActionError(
        `${captain.id}'s ship has no room for ${action.count} more`,
        action,
      )
    }
  } else if (action.count > aboardCount) {
    throw new InvalidActionError(`${captain.id} has only ${aboardCount} aboard to unload`, action)
  }

  const delta = action.direction === 'toShip' ? -action.count : action.count

  return {
    ...state,
    cities: state.cities.map((c) =>
      c.id === city.id
        ? { ...c, garrison: { ...c.garrison, [action.unitId]: garrisonCount + delta } }
        : c,
    ),
    captains: state.captains.map((cap) =>
      cap.id === captain.id
        ? { ...cap, troopsAboard: { ...cap.troopsAboard, [action.unitId]: aboardCount - delta } }
        : cap,
    ),
  }
}

/** Sets the defensive policy the combat driver consults if this city/fleet is attacked. */
function setStandingOrder(state: GameState, action: SetStandingOrderAction): GameState {
  if (action.targetType === 'city') {
    const city = state.cities.find((c) => c.id === action.targetId)
    if (!city || city.ownerId !== action.playerId) {
      throw new InvalidActionError(`No city ${action.targetId} owned by ${action.playerId}`, action)
    }
    return {
      ...state,
      cities: state.cities.map((c) =>
        c.id === city.id ? { ...c, standingOrder: action.order } : c,
      ),
    }
  }

  const captain = state.captains.find((c) => c.id === action.targetId)
  if (!captain || captain.ownerId !== action.playerId) {
    throw new InvalidActionError(
      `No captain ${action.targetId} owned by ${action.playerId}`,
      action,
    )
  }
  return {
    ...state,
    captains: state.captains.map((c) =>
      c.id === captain.id ? { ...c, standingOrder: action.order } : c,
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
    ? state.cities.map((c) => {
        const owner = state.players.find((p) => p.id === c.ownerId)
        return {
          ...c,
          builtThisRound: false,
          unitAvailability: owner
            ? replenishAvailability(c, owner.faction, catalog)
            : c.unitAvailability,
        }
      })
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
