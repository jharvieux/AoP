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

/**
 * Per-point effect of the three captain stats (#498), injected from
 * @aop/content like every other balance number. Attack/defense points are FLAT
 * per-unit adds — a captain with attack stat N adds `N × attackPerPoint` to the
 * attack score of every unit under their command, applied before the skills'
 * percentage scaling; speed feeds movement refresh.
 */
export interface CaptainStatTuningLike {
  attackPerPoint: number
  defensePerPoint: number
  speedMovementPerPoint: number
}

/**
 * One collectible item's passive effect (#498): stat-point boosts, live while
 * the item is carried (stash items are inert). Names/descriptions stay in
 * @aop/content — the engine needs only numbers.
 */
export interface ItemLike {
  /** Stat points this item adds to its carrier's attack/defense/speed. */
  stats: { attack: number; defense: number; speed: number }
  /** Relative weight for the seeded drop roll — higher is more common. */
  weight: number
}

/** Item drop tables and carry rules (#498), injected from @aop/content. */
export interface ItemCatalogLike {
  defs: Record<string, ItemLike>
  /** Items a captain can carry; finds beyond this overflow to the owner's stash. */
  captainItemCap: number
  /** Drop probability in [0,1] on a successful sea encounter. */
  seaEncounterDropChance: number
  /** Drop probability in [0,1] on capturing a haul land site. */
  landHaulDropChance: number
  /** Drop probability in [0,1] on a successful land encounter. */
  landEncounterDropChance: number
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

/** Land resource-site kinds (#466), scattered on `land` tiles by mapgen. */
export type LandSiteKind = 'mine' | 'sawmill' | 'lumberCamp' | 'ruins'

/** How a land site pays out (#466): ongoing while claimed, or a one-time haul on capture. */
export type LandSiteMode = 'hold' | 'haul'

/** One land-site kind's balance data, injected from @aop/content. */
export interface LandSiteDefLike {
  mode: LandSiteMode
  /** hold → resources per round while claimed; haul → the one-time capture payout. */
  yield: Partial<ResourcePool>
  /** Relative weight for the seeded kind roll at map generation. */
  weight: number
}

/** Land-site balance data injected from @aop/content (#466), like the other catalogs. */
export interface LandSiteCatalogLike {
  sites: Partial<Record<LandSiteKind, LandSiteDefLike>>
  /** Sites spawned ≈ floor(landTiles * spawnDensity). */
  spawnDensity: number
  /** Keep sites this many tiles clear of any start position. */
  minStartDistance: number
}

/** Land random-encounter kinds (#466), resolved by landing parties. */
export type LandEncounterKind = 'nativeVillage' | 'hermit' | 'banditCamp'

/**
 * Land-encounter balance data injected from @aop/content (#466). Reuses the
 * sea encounters' per-kind {@link EncounterKindLike} shape (seeded choices with
 * the same outcome parameters); only the kinds and spawn knobs differ.
 */
export interface LandEncounterCatalogLike {
  nativeVillage: EncounterKindLike
  hermit: EncounterKindLike
  banditCamp: EncounterKindLike
  /** Land encounters spawned ≈ floor(landTiles * spawnDensity). */
  spawnDensity: number
  /** Keep land encounters this many tiles clear of any start position. */
  minStartDistance: number
}

/** Inland-settlement seeding tuning injected from @aop/content (#467). */
export interface InlandSettlementLike {
  /** Target count ≈ floor(interiorLandTiles * density), capped by available interior tiles. */
  density: number
  /** Buildings a freshly-seeded neutral settlement carries (never a shipyard — landlocked). */
  buildings: readonly string[]
  /** Keep settlements this many tiles clear of any start position. */
  minStartDistance: number
}

/** The four map-editor resource-marker kinds (#41, #101). */
export type ResourceNodeKind = 'gold' | 'timber' | 'iron' | 'rum'

/** Per-round yield of one resource-node kind, injected from @aop/content. */
export interface ResourceNodeLike {
  yield: Partial<ResourcePool>
}

/**
 * Automatic city-defense tuning (#435), injected from @aop/content. Its presence
 * is what arms an attacked city with militia and turrets *on top of* its
 * recruited garrison; a catalog without it (pre-#435 snapshots, minimal test
 * catalogs) fields the garrison alone, exactly as before. All balance numbers —
 * the engine holds none — so the derivation reads them from here.
 */
export interface CityDefenseTuning {
  militiaPerType: number
  turretCount: number
  /** Faction whose roster arms a neutral (unowned) city's militia and turrets. */
  neutralRosterFactionId: string
}

export interface ContentCatalog {
  buildings: Record<string, BuildingLike>
  units: Record<string, UnitLike>
  ships: Record<string, ShipLike>
  skills: Record<string, SkillLike>
  /** Cumulative XP required to *be* at level N (1-based; captains start at level 1). */
  captainXpThresholds: number[]
  /**
   * Captain stat-point effects (#498). Optional: without it, spent stat points
   * confer no combat/speed effect and `chooseCaptainStat` is rejected — a
   * catalog that omits the tuning has no stat system to spend into.
   */
  captainStats?: CaptainStatTuningLike
  /**
   * Item defs and drop tables (#498). Optional: matches without it drop no
   * items (and draw no item RNG), and the item-transfer actions are rejected.
   */
  items?: ItemCatalogLike
  /** Random-encounter tables (#23). Optional: matches without it spawn no encounters. */
  encounters?: EncounterCatalogLike
  /**
   * Land resource-site tables (#466). Optional: matches without it scatter no
   * land sites and grant no site income even if the state carries some.
   */
  landSites?: LandSiteCatalogLike
  /**
   * Land random-encounter tables (#466). Optional: matches without it scatter
   * no land encounters.
   */
  landEncounters?: LandEncounterCatalogLike
  /**
   * Inland unaffiliated settlement seeding (#467). Optional: matches without it
   * seed no inland neutral cities.
   */
  inlandSettlements?: InlandSettlementLike
  /**
   * Per-round yield for authored resource nodes (#101), keyed by kind.
   * Optional: matches without it grant no resource-node income even if the
   * map carries nodes.
   */
  resourceNodes?: Partial<Record<ResourceNodeKind, ResourceNodeLike>>
  /**
   * Automatic city-defense tuning (#435). Optional: a catalog without it fields
   * an attacked city's recruited garrison alone (no militia, no turrets).
   */
  cityDefense?: CityDefenseTuning
  /**
   * Rounds between city recruit-pool replenishments (#453). Optional: absent or
   * `1` means every round (the pre-#453 behaviour); higher values slow the
   * garrison snowball. Read at turn advance; belongs in content, not the engine,
   * because it is a tuned balance number.
   */
  recruitReplenishInterval?: number
}
