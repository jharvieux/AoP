import type { FactionId, ResourcePool } from '@aop/shared'

/**
 * Building tree shared by all factions mechanically; `FACTION_BUILDING_NAMES`
 * layers per-faction flavor text on top without forking the tree shape.
 * `requires` names a prerequisite building id in the same city — the
 * construction action enforces it. One tree per category, HoMM-style:
 * economy (resource income), recruitment (unlocks unit tiers, see
 * @aop/content's UnitDef.tier), fortification (city defense bonus), shipyard
 * (gates the ship upgrade action, #22).
 */

export type BuildingCategory = 'economy' | 'recruitment' | 'fortification' | 'shipyard'

export interface BuildingDef {
  id: string
  name: string
  category: BuildingCategory
  /** Construction cost. */
  cost: Partial<ResourcePool>
  /** Resources produced each round this building is standing. */
  produces: Partial<ResourcePool>
  /** Prerequisite building id, if any. */
  requires?: string
  /** Highest unit recruitment tier this building unlocks (recruitment category only). */
  unlocksTier?: 1 | 2 | 3 | 4
  /** Flat defense bonus applied to the garrison during a city assault (fortification only). */
  defenseBonus?: number
  /** True for the building that unlocks the ship-upgrade action at this city (shipyard only). */
  unlocksShipyard?: boolean
}

export const BUILDINGS: Record<string, BuildingDef> = {
  townhall: {
    id: 'townhall',
    name: 'Town Hall',
    category: 'economy',
    cost: {},
    produces: { gold: 100 },
  },
  sawmill: {
    id: 'sawmill',
    name: 'Sawmill',
    category: 'economy',
    cost: { gold: 200 },
    produces: { timber: 4 },
    requires: 'townhall',
  },
  ironmine: {
    id: 'ironmine',
    name: 'Iron Mine',
    category: 'economy',
    cost: { gold: 250, timber: 10 },
    produces: { iron: 3 },
    requires: 'townhall',
  },
  distillery: {
    id: 'distillery',
    name: 'Distillery',
    category: 'economy',
    cost: { gold: 220 },
    produces: { rum: 3 },
    requires: 'townhall',
  },
  tradehouse: {
    id: 'tradehouse',
    name: 'Trade House',
    category: 'economy',
    cost: { gold: 350, timber: 15 },
    produces: { gold: 60 },
    requires: 'townhall',
  },
  barracks: {
    id: 'barracks',
    name: 'Barracks',
    category: 'recruitment',
    cost: { gold: 150 },
    produces: {},
    requires: 'townhall',
    unlocksTier: 1,
  },
  garrisonHall: {
    id: 'garrisonHall',
    name: 'Garrison Hall',
    category: 'recruitment',
    cost: { gold: 400, timber: 20 },
    produces: {},
    requires: 'barracks',
    unlocksTier: 2,
  },
  fortressArmory: {
    id: 'fortressArmory',
    name: 'Fortress Armory',
    category: 'recruitment',
    cost: { gold: 900, iron: 30 },
    produces: {},
    requires: 'garrisonHall',
    unlocksTier: 3,
  },
  grandArsenal: {
    id: 'grandArsenal',
    name: 'Grand Arsenal',
    category: 'recruitment',
    cost: { gold: 1800, iron: 60, rum: 20 },
    produces: {},
    requires: 'fortressArmory',
    unlocksTier: 4,
  },
  palisade: {
    id: 'palisade',
    name: 'Palisade',
    category: 'fortification',
    cost: { gold: 120, timber: 20 },
    produces: {},
    requires: 'townhall',
    defenseBonus: 10,
  },
  stoneWall: {
    id: 'stoneWall',
    name: 'Stone Wall',
    category: 'fortification',
    cost: { gold: 500, iron: 15 },
    produces: {},
    requires: 'palisade',
    defenseBonus: 30,
  },
  citadel: {
    id: 'citadel',
    name: 'Citadel',
    category: 'fortification',
    cost: { gold: 1400, iron: 40 },
    produces: {},
    requires: 'stoneWall',
    defenseBonus: 70,
  },
  shipyard: {
    id: 'shipyard',
    name: 'Shipyard',
    category: 'shipyard',
    cost: { gold: 300, timber: 20 },
    produces: {},
    requires: 'townhall',
    unlocksShipyard: true,
  },
}

/** Buildings every starting city has before the player builds anything. */
export const STARTING_BUILDINGS: readonly string[] = ['townhall']

/**
 * Per-faction flavor names layered over the shared building tree — e.g. the
 * Pirates' "Barracks" is the British "Drill Yard". Falls back to the
 * mechanical name in `BUILDINGS` when a faction has no override.
 */
export const FACTION_BUILDING_NAMES: Partial<Record<FactionId, Record<string, string>>> = {
  pirates: { barracks: 'Cutthroat Den', palisade: 'Driftwood Barricade' },
  british: { barracks: 'Drill Yard', palisade: 'Redoubt' },
  spanish: { barracks: 'Cuartel', palisade: 'Empalizada' },
  dutch: { barracks: 'Schutterij Hall', palisade: 'Aardwerk' },
  french: { barracks: 'Caserne', palisade: 'Palissade' },
}

/** The display name for a building, honoring per-faction flavor overrides. */
export function buildingDisplayName(buildingId: string, factionId: FactionId): string {
  const override = FACTION_BUILDING_NAMES[factionId]?.[buildingId]
  return override ?? BUILDINGS[buildingId]?.name ?? buildingId
}
