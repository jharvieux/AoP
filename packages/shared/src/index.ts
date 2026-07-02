/**
 * Shared types and utilities used by the engine, content, client, and
 * (later) Supabase Edge Functions. Must stay free of runtime dependencies.
 */

export type FactionId = 'pirates' | 'british' | 'spanish' | 'dutch'

export const FACTION_IDS: readonly FactionId[] = ['pirates', 'british', 'spanish', 'dutch']

export type MapSize = 'small' | 'medium' | 'large'

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

/** Integer 2D tile coordinate on the world map grid. */
export interface TileCoord {
  x: number
  y: number
}

export interface MapDimensions {
  width: number
  height: number
}

/** Tile-grid size per MapSize. Real terrain generation lands with #6; this is the shared geometry. */
export const MAP_DIMENSIONS: Record<MapSize, MapDimensions> = {
  small: { width: 24, height: 24 },
  medium: { width: 36, height: 36 },
  large: { width: 48, height: 48 },
}
