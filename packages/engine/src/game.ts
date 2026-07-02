import { EMPTY_RESOURCES } from '@aop/shared'
import { placeCities } from './placement'
import { seedRng } from './rng'
import { DEFAULT_STANDING_ORDER } from './standingOrders'
import type { CaptainState, CityState, GameConfig, GameState } from './types'
import { accumulateExploredTiles } from './visibility'

const STARTING_GOLD = 1000

export function createGame(config: GameConfig): GameState {
  if (config.players.length < 2) {
    throw new Error('A game needs at least 2 players')
  }
  if (config.players.length > 8) {
    throw new Error('A game supports at most 8 players')
  }
  const ids = new Set(config.players.map((p) => p.id))
  if (ids.size !== config.players.length) {
    throw new Error('Player ids must be unique')
  }

  const startingBuildings = config.startingBuildings ?? []
  const [rngState, positions] = placeCities(
    seedRng(config.seed),
    config.players.length,
    config.mapSize,
  )

  const withoutVision: GameState = {
    config,
    round: 1,
    currentPlayerIndex: 0,
    players: config.players.map((p) => ({
      id: p.id,
      name: p.name,
      faction: p.faction,
      isAI: p.isAI,
      resources: { ...EMPTY_RESOURCES, gold: STARTING_GOLD },
      eliminated: false,
    })),
    cities: config.players.map((p, i): CityState => ({
      id: `${p.id}-capital`,
      ownerId: p.id,
      name: `${p.name}'s Capital`,
      position: positions[i]!,
      buildings: [...startingBuildings],
      builtThisRound: false,
      garrison: {},
      unitAvailability: {},
      standingOrder: DEFAULT_STANDING_ORDER,
    })),
    captains: config.startingShipClassId
      ? config.players.map((p): CaptainState => ({
          id: `${p.id}-flagship`,
          ownerId: p.id,
          name: `${p.name}'s Flagship`,
          shipClassId: config.startingShipClassId!,
          troopsAboard: {},
          standingOrder: DEFAULT_STANDING_ORDER,
          xp: 0,
          skills: [],
          shipUpgrades: {},
        }))
      : [],
    exploredTiles: {},
    rngState,
    actionCount: 0,
    status: 'active',
    winnerId: null,
  }

  return {
    ...withoutVision,
    exploredTiles: Object.fromEntries(
      config.players.map((p) => [p.id, accumulateExploredTiles(withoutVision, p.id)]),
    ),
  }
}

export function currentPlayer(state: GameState) {
  const player = state.players[state.currentPlayerIndex]
  if (!player) throw new Error(`Invalid currentPlayerIndex ${state.currentPlayerIndex}`)
  return player
}
