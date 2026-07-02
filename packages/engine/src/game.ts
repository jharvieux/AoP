import { EMPTY_RESOURCES } from '@aop/shared'
import { generateMap } from './map'
import { seedRng } from './rng'
import type { GameConfig, GameState } from './types'

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

  const map = generateMap(config.seed, config.mapSize, config.players.length)

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
    rngState: seedRng(config.seed),
    actionCount: 0,
    status: 'active',
    winnerId: null,
  }
}

export function currentPlayer(state: GameState) {
  const player = state.players[state.currentPlayerIndex]
  if (!player) throw new Error(`Invalid currentPlayerIndex ${state.currentPlayerIndex}`)
  return player
}
