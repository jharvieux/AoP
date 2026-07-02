import type { Coord, FactionId, MapSize, ResourcePool } from '@aop/shared'
import type { CombatStatsData } from './combat'
import type { GameMap } from './map'
import type { RngState } from './rng'
import type { StandingOrder } from './tactics'

/** A homogeneous group of troops aboard a captain's ship. `unitId` indexes @aop/content. */
export interface TroopStack {
  unitId: string
  count: number
}

export interface PlayerConfig {
  id: string
  name: string
  faction: FactionId
  isAI: boolean
  /**
   * Optional starting troops for this player's captain. Populated by the caller
   * from @aop/content so the engine stays free of any content dependency.
   */
  startingTroops?: TroopStack[]
}

/**
 * A captain — the hero analog. Sails a flagship over water, carries troops, and
 * fights ship-to-ship. Lives in GameState as plain data.
 */
export interface Captain {
  id: string
  ownerId: string
  position: Coord
  /** Flagship class id (indexes @aop/content SHIP_CLASSES). */
  shipClassId: string
  /** Movement points remaining this turn (one point = one water step). */
  movementPoints: number
  /** Movement points granted at the start of each of the owner's turns. */
  maxMovementPoints: number
  troops: TroopStack[]
  /**
   * Conditional defence plan used when this captain is attacked (Phase 3:
   * while its owner is offline). Hidden information — Phase 3 view filtering
   * must strip this from enemy-facing views, like rngState (D-009).
   */
  standingOrders?: StandingOrder[]
}

export interface GameConfig {
  /** Seed for map generation and all in-game randomness. */
  seed: number
  mapSize: MapSize
  players: PlayerConfig[]
  /**
   * Combat-relevant stats snapshot, injected from @aop/content by the caller so
   * the engine holds no balance data. Frozen into the match for replay/authority
   * determinism. Required before any combat action can resolve.
   */
  combatStats?: CombatStatsData
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
  /** The generated world map. Derived deterministically from the config seed. */
  map: GameMap
  /** 1-based round number; increments when the last living player ends their turn. */
  round: number
  /** Index into players[] of whoever acts now. */
  currentPlayerIndex: number
  players: PlayerState[]
  /** All captains in play, across all owners. */
  captains: Captain[]
  rngState: RngState
  /** Total actions applied; doubles as the action-log sequence cursor. */
  actionCount: number
  status: GameStatus
  winnerId: string | null
}
