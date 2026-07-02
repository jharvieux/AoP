import type { FactionId, MapSize, ResourcePool, TileCoord } from '@aop/shared'
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
  /** Building ids every player's starting city begins with (caller-supplied from content). */
  startingBuildings?: string[]
  /** Ship class id for each player's starting flagship (caller-supplied from content). */
  startingShipClassId?: string
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
 * A settlement owned by a player. Buildings are ids into @aop/content's
 * BUILDINGS table — the engine never hardcodes what a building does.
 */
export interface CityState {
  id: string
  ownerId: string
  name: string
  /** Placeholder deterministic placement (see placement.ts) until real map gen (#6) lands. */
  position: TileCoord
  buildings: string[]
  /** True once this city has constructed a building this round (HoMM one-build-per-turn rule). */
  builtThisRound: boolean
  /** Recruited troops garrisoned in the city, keyed by unit id. */
  garrison: Record<string, number>
  /** Recruits currently available to buy, keyed by unit id (weekly-growth style). */
  unitAvailability: Record<string, number>
}

/** A player's captain: a flagship with troops aboard. Map position arrives with world map gen. */
export interface CaptainState {
  id: string
  ownerId: string
  name: string
  shipClassId: string
  /** Troops aboard the flagship, keyed by unit id. Bounded by the ship's crew capacity. */
  troopsAboard: Record<string, number>
}

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
  cities: CityState[]
  captains: CaptainState[]
  /**
   * Every tile each player has ever seen, keyed by playerId, values are
   * "x,y" tile keys. Currently-visible tiles are recomputed on demand by
   * visibility.ts's visibleState() selector — only the persistent history
   * needs to live in state.
   */
  exploredTiles: Record<string, string[]>
  rngState: RngState
  /** Total actions applied; doubles as the action-log sequence cursor. */
  actionCount: number
  status: GameStatus
  winnerId: string | null
}
