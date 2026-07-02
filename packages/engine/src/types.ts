import type { FactionId, MapSize, ResourcePool } from '@aop/shared'
import type { RngState } from './rng'

export interface PlayerConfig {
  id: string
  name: string
  faction: FactionId
  isAI: boolean
}

export interface GameConfig {
  /** Seed for map generation and all in-game randomness. */
  seed: number
  mapSize: MapSize
  players: PlayerConfig[]
}

export interface PlayerState {
  id: string
  name: string
  faction: FactionId
  isAI: boolean
  resources: ResourcePool
  eliminated: boolean
}

export type GameStatus = 'active' | 'finished'

/**
 * The complete authoritative game state. Must be plain JSON-serializable data:
 * no classes, functions, Dates, Maps, or undefined values in arrays.
 */
export interface GameState {
  config: GameConfig
  /** 1-based round number; increments when the last living player ends their turn. */
  round: number
  /** Index into players[] of whoever acts now. */
  currentPlayerIndex: number
  players: PlayerState[]
  rngState: RngState
  /** Total actions applied; doubles as the action-log sequence cursor. */
  actionCount: number
  status: GameStatus
  winnerId: string | null
}
