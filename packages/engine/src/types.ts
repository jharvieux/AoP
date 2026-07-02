import type { Coord, FactionId, MapSize, ResourcePool } from '@aop/shared'
import type { AiTuning } from './ai'
import type { CombatStatsData } from './combat'
import type { ContentCatalog, EncounterKind } from './content'
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
  name: string
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
  /** Cumulative combat/exploration XP (#21). Level is derived from this via skills.ts. */
  xp: number
  /** Skill ids chosen at level-up, in pick order. At most one per level above 1. */
  skills: string[]
  /** Purchased level (0 = stock) per upgrade track at a city shipyard (#22). Missing key = 0. */
  shipUpgrades: Record<string, number>
}

/**
 * A settlement owned by a player. Buildings are ids into @aop/content's
 * BUILDINGS table — the engine never hardcodes what a building does.
 */
export interface CityState {
  id: string
  ownerId: string
  name: string
  /** The land (port) tile the city sits on, taken from its home island on the generated map. */
  position: Coord
  buildings: string[]
  /** True once this city has constructed a building this round (HoMM one-build-per-turn rule). */
  builtThisRound: boolean
  /** Recruited troops garrisoned in the city, keyed by unit id. */
  garrison: Record<string, number>
  /** Recruits currently available to buy, keyed by unit id (weekly-growth style). */
  unitAvailability: Record<string, number>
}

/**
 * Opening-state balance data — starting economy, captain loadout, and map
 * geometry. Injected from @aop/content by the caller so the engine holds no
 * balance numbers; frozen into the match for replay/authority determinism.
 */
export interface GameSetup {
  startingGold: number
  startingCaptainMovement: number
  startingShipClass: string
  homeIslandRadius: number
  /** Building ids every player's capital begins with. */
  startingBuildings: string[]
  /** Tiles within this Chebyshev radius of an owned city are visible (fog of war, #14). */
  cityVisionRadius: number
  /** Tiles within this Chebyshev radius of an owned captain are visible (fog of war, #14). */
  captainVisionRadius: number
  /** XP the winning captain earns from a decisive naval victory (#21). */
  combatWinXp: number
}

export interface GameConfig {
  /** Seed for map generation and all in-game randomness. */
  seed: number
  mapSize: MapSize
  players: PlayerConfig[]
  /** Opening-state balance data (economy, captain loadout, map geometry). */
  setup: GameSetup
  /**
   * Combat-relevant stats snapshot, injected from @aop/content by the caller so
   * the engine holds no balance data. Frozen into the match for replay/authority
   * determinism. Required before any combat action can resolve.
   */
  combatStats?: CombatStatsData
  /**
   * Balance tables for economy, recruitment, skills, and ship upgrades, injected
   * from @aop/content the same way as {@link combatStats}. Required before the
   * construct/recruit/skill/upgrade actions can resolve.
   */
  content?: ContentCatalog
  /**
   * Weights and thresholds the single-player AI (#13/#67) uses to score its
   * candidate actions, injected from @aop/content the same way as
   * {@link combatStats}. Without it the AI still plays combat (using built-in
   * fallback scores) but skips every economy decision — building, recruiting,
   * fleet loading, upgrades, and skill picks all require it.
   */
  aiTuning?: AiTuning
}

export interface PlayerState {
  id: string
  name: string
  faction: FactionId
  isAI: boolean
  resources: ResourcePool
  eliminated: boolean
}

/**
 * A random-encounter entity on the map (#23) — a merchant, native village, or
 * band of settlers a passing captain can interact with. Placed deterministically
 * by mapgen; plain data so it serializes and replays like everything else.
 */
export interface EncounterState {
  id: string
  kind: EncounterKind
  position: Coord
  /** False once resolved; flips back to true when {@link respawnRound} is reached. */
  active: boolean
  /** Round at which a consumed encounter reactivates; null = active, or gone for good. */
  respawnRound: number | null
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
  cities: CityState[]
  /** All captains in play, across all owners. */
  captains: Captain[]
  /** Random encounters placed by mapgen (#23). Empty when the match has no encounter content. */
  encounters: EncounterState[]
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
