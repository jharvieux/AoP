/**
 * Shared types and utilities used by the engine, content, client, and
 * (later) Supabase Edge Functions. Must stay free of runtime dependencies.
 */

export type FactionId = 'pirates' | 'british' | 'spanish' | 'dutch'

export const FACTION_IDS: readonly FactionId[] = ['pirates', 'british', 'spanish', 'dutch']

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
