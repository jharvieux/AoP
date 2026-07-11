import type { FactionId, ResourcePool } from '@aop/shared'

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
  /** True for the building that unlocks the recruitCaptain action at this city (#433). */
  unlocksCaptains?: boolean
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

/** The three random-encounter entity kinds spawned by mapgen (#23). */
export type EncounterKind = 'merchant' | 'natives' | 'settlers'

/**
 * The choices a captain can make at an encounter. Not every choice is valid at
 * every kind — the catalog's per-kind `choices` map declares which apply
 * (merchant: trade/rob; natives: trade/fight/quest; settlers: recruit/escort/raid).
 */
export type EncounterChoice = 'trade' | 'rob' | 'fight' | 'quest' | 'recruit' | 'escort' | 'raid'

export const ENCOUNTER_CHOICES: readonly EncounterChoice[] = [
  'trade',
  'rob',
  'fight',
  'quest',
  'recruit',
  'escort',
  'raid',
]

/** The seeded outcome parameters for one choice at one encounter kind. */
export interface EncounterChoiceLike {
  /** Probability in [0,1] the choice succeeds; 1 = deterministic success. */
  successChance: number
  /** Resources paid up front regardless of outcome (e.g. goods bought to trade). */
  cost?: Partial<ResourcePool>
  /** Resources granted on success. */
  reward?: Partial<ResourcePool>
  /** Captain XP granted on success (#21). */
  xp?: number
  /** Fraction in [0,1] of each of the captain's troop stacks lost on failure. */
  failTroopLossPct?: number
  /** Unit id granted on success, chosen by the recruiting captain's faction. */
  grantUnitByFaction?: Partial<Record<FactionId, string>>
  /** How many of {@link grantUnitByFaction} to add on success. */
  grantCount?: number
}

export interface EncounterKindLike {
  /** Valid choices for this kind, each with its seeded outcome parameters. */
  choices: Partial<Record<EncounterChoice, EncounterChoiceLike>>
  /** Rounds after a consumed encounter of this kind respawns; 0 = never. */
  respawnDelay: number
}

/** Encounter balance data injected from @aop/content, like the other catalogs. */
export interface EncounterCatalogLike {
  merchant: EncounterKindLike
  natives: EncounterKindLike
  settlers: EncounterKindLike
  /** Encounters spawned ≈ floor(navigableWaterTiles * spawnDensity). */
  spawnDensity: number
  /** Keep encounters off each player's doorstep so starts don't hand out free loot. */
  minStartDistance: number
}

/** The four map-editor resource-marker kinds (#41, #101). */
export type ResourceNodeKind = 'gold' | 'timber' | 'iron' | 'rum'

/** Per-round yield of one resource-node kind, injected from @aop/content. */
export interface ResourceNodeLike {
  yield: Partial<ResourcePool>
}

export interface ContentCatalog {
  buildings: Record<string, BuildingLike>
  units: Record<string, UnitLike>
  ships: Record<string, ShipLike>
  skills: Record<string, SkillLike>
  /** Cumulative XP required to *be* at level N (1-based; captains start at level 1). */
  captainXpThresholds: number[]
  /** Random-encounter tables (#23). Optional: matches without it spawn no encounters. */
  encounters?: EncounterCatalogLike
  /**
   * Per-round yield for authored resource nodes (#101), keyed by kind.
   * Optional: matches without it grant no resource-node income even if the
   * map carries nodes.
   */
  resourceNodes?: Partial<Record<ResourceNodeKind, ResourceNodeLike>>
}
