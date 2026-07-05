/**
 * Shared types and utilities used by the engine, content, client, and
 * (later) Supabase Edge Functions. Must stay free of runtime dependencies.
 */

// Generated Supabase schema types — the typed client the Edge Functions build on.
export type { Database, Json } from './database.types'

// Snapshot compaction policy (docs/MULTIPLAYER.md §10) — pure, shared by the
// compact-snapshots Edge Function and the engine's determinism test suite.
export {
  type SnapshotMeta,
  DEFAULT_ROUNDS_PER_SNAPSHOT,
  snapshotKeepSet,
  snapshotsToDelete,
} from './snapshots'

// Multiplayer transport contracts (turn poke + timer state machine), shared by
// the Edge Functions and the web client.
export * from './multiplayer'

// Ratings foundation (#151) — pure Elo rating-math, shared by the future
// match-finish Edge Function (#152) and any client-side preview of a rating change.
export {
  type PlayerRating,
  type MatchResult,
  DEFAULT_RATING,
  DEFAULT_K_FACTOR,
  expectedScore,
  applyRatingUpdate,
} from './rating'

// Quick-match queue policy (#153): pure seat assignment + the dependency-injected
// drain orchestration, shared by the drain Edge Function and its vitest suite.
export * from './matchmaking'

export type FactionId = 'pirates' | 'british' | 'spanish' | 'dutch' | 'french'

export const FACTION_IDS: readonly FactionId[] = [
  'pirates',
  'british',
  'spanish',
  'dutch',
  'french',
]

export type MapSize = 'small' | 'medium' | 'large'

/** A grid coordinate. Origin is top-left; +x is east, +y is south. */
export interface Coord {
  x: number
  y: number
}

export function coordsEqual(a: Coord, b: Coord): boolean {
  return a.x === b.x && a.y === b.y
}

/** Chebyshev (king-move) distance — the step count under 8-directional movement. */
export function chebyshevDistance(a: Coord, b: Coord): number {
  return Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y))
}

/** Manhattan distance — used for coarse proximity/fairness measures. */
export function manhattanDistance(a: Coord, b: Coord): number {
  return Math.abs(a.x - b.x) + Math.abs(a.y - b.y)
}

export interface ResourcePool {
  gold: number
  timber: number
  iron: number
  rum: number
}

export const EMPTY_RESOURCES: ResourcePool = { gold: 0, timber: 0, iron: 0, rum: 0 }

export function addResources(a: ResourcePool, b: Partial<ResourcePool>): ResourcePool {
  return {
    gold: a.gold + (b.gold ?? 0),
    timber: a.timber + (b.timber ?? 0),
    iron: a.iron + (b.iron ?? 0),
    rum: a.rum + (b.rum ?? 0),
  }
}

/** True if `pool` has at least `cost` of every resource named in `cost`. */
export function canAfford(pool: ResourcePool, cost: Partial<ResourcePool>): boolean {
  return (
    pool.gold >= (cost.gold ?? 0) &&
    pool.timber >= (cost.timber ?? 0) &&
    pool.iron >= (cost.iron ?? 0) &&
    pool.rum >= (cost.rum ?? 0)
  )
}

/** Subtract `cost` from `pool`. Callers must check canAfford first. */
export function subtractResources(pool: ResourcePool, cost: Partial<ResourcePool>): ResourcePool {
  return {
    gold: pool.gold - (cost.gold ?? 0),
    timber: pool.timber - (cost.timber ?? 0),
    iron: pool.iron - (cost.iron ?? 0),
    rum: pool.rum - (cost.rum ?? 0),
  }
}
