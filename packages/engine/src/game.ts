import { EMPTY_RESOURCES } from '@aop/shared'
import { generateMap } from './map'
import { seedRng } from './rng'
import type { Captain, GameConfig, GameState } from './types'

const STARTING_GOLD = 1000

/**
 * Movement points a starting captain regains each turn. A game-rule default;
 * once shipyards land, this will be driven by the flagship's content speed stat.
 */
export const STARTING_CAPTAIN_MOVEMENT = 5

/** The flagship class every player starts with until shipyards are built. */
export const STARTING_SHIP_CLASS = 'sloop'

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

  const map = generateMap(config.seed, config.mapSize, config.players.length)

  const captains: Captain[] = config.players.map((p, i) => ({
    id: `cap-${p.id}`,
    ownerId: p.id,
    position: { ...map.startPositions[i]! },
    shipClassId: STARTING_SHIP_CLASS,
    movementPoints: STARTING_CAPTAIN_MOVEMENT,
    maxMovementPoints: STARTING_CAPTAIN_MOVEMENT,
    troops: (p.startingTroops ?? []).map((t) => ({ ...t })),
  }))

  return {
    config,
    map,
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
    captains,
    rngState: seedRng(config.seed),
    actionCount: 0,
    status: 'active',
    winnerId: null,
  }
}

export function captainsOf(state: GameState, playerId: string): Captain[] {
  return state.captains.filter((c) => c.ownerId === playerId)
}

export function currentPlayer(state: GameState) {
  const player = state.players[state.currentPlayerIndex]
  if (!player) throw new Error(`Invalid currentPlayerIndex ${state.currentPlayerIndex}`)
  return player
}
