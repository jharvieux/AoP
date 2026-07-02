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
  /** Flat defense bonus applied during a city assault (fortification buildings). */
  defenseBonus?: number
  /** True for the building that unlocks the ship-upgrade action at this city. */
  unlocksShipyard?: boolean
}

export interface UnitLike {
  factionId: string
  tier: 1 | 2 | 3 | 4
  goldCost: number
  weeklyGrowth: number
  attack: number
  defense: number
  health: number
}

export interface ShipUpgradeLevelLike {
  goldCost: number
  amount: number
}

export interface ShipLike {
  hull: number
  cannons: number
  speed: number
  crewCapacity: number
  /** Purchasable levels per upgrade track (#22), ordered — index 0 is the first level's cost/effect. */
  upgrades: Record<string, ShipUpgradeLevelLike[]>
}

export interface SkillLike {
  factionId: string
  tier: 1 | 2 | 3 | 4
  attackBonusPct: number
  defenseBonusPct: number
}

export interface ContentCatalog {
  buildings: Record<string, BuildingLike>
  units: Record<string, UnitLike>
  ships: Record<string, ShipLike>
  skills: Record<string, SkillLike>
  /** Cumulative XP required to *be* at level N (1-based; captains start at level 1). */
  captainXpThresholds: number[]
}
