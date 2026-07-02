import type { ResourcePool } from '@aop/shared'

/**
 * The engine never imports @aop/content (it must stay dependency-free per
 * the repo's engine invariants). Instead, callers — the web client, and
 * later the multiplayer edge functions — pass in a ContentCatalog built
 * from @aop/content. The real content defs (BuildingDef, UnitDef, ...)
 * structurally satisfy these shapes, so no engine-side duplication of
 * balance numbers is needed.
 */

export interface BuildingLike {
  produces: Partial<ResourcePool>
  cost: Partial<ResourcePool>
  requires?: string
  unlocksTier?: 1 | 2 | 3 | 4
}

export interface UnitLike {
  factionId: string
  tier: 1 | 2 | 3 | 4
  goldCost: number
  weeklyGrowth: number
}

export interface ShipLike {
  crewCapacity: number
}

export interface ContentCatalog {
  buildings: Record<string, BuildingLike>
  units: Record<string, UnitLike>
  ships: Record<string, ShipLike>
}
