import type { FactionId, ResourcePool } from '@aop/shared'

/**
 * Building tree shared by all factions mechanically; `FACTION_BUILDING_NAMES`
 * layers per-faction flavor text on top without forking the tree shape.
 * `requires` names a prerequisite building id in the same city — the
 * construction action enforces it. One tree per category, HoMM-style:
 * economy (resource income), recruitment (unlocks unit tiers, see
 * @aop/content's UnitDef.tier), fortification (city defense bonus), shipyard
 * (gates the ship upgrade action, #22). `tavern` also lives under `economy` —
 * it produces no resources but gates the recruitCaptain action (#433), which
 * didn't warrant its own single-building category.
 */

export type BuildingCategory = 'economy' | 'recruitment' | 'fortification' | 'shipyard'

export interface BuildingDef {
  id: string
  name: string
  category: BuildingCategory
  /**
   * What the building does, for build-modal tooltips and management modals
   * (#430/#431). Flavor prose only — balance numbers (produces, defenseBonus,
   * unlocksTier) stay in their data fields so the UI derives figures that can
   * never drift from what the engine actually applies.
   */
  description: string
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
  /** True for the building that unlocks the recruitCaptain action at this city (#433). */
  unlocksCaptains?: boolean
  /**
   * Generated art (#427/#436/#447), served from apps/web/public. Follows the same
   * `resolveSpriteUrl` theme-pack override chain as other content art (mapSprites.ts).
   * Every building in `BUILDINGS` has one; CityScene.tsx falls back to its existing
   * category-colored placeholder block if the URL 404s or a theme pack clears it.
   */
  spriteUrl?: string
  /**
   * Corner-tower accessory art (#447, fortification only): the citadel's wall segment
   * sprite is towerless by design (see docs/art/city-v1/MANIFEST.md's wallseg-citadel
   * entry) — this supplies the one clean ring-corner tower rendered alongside it in the
   * city scene. Not a separate BuildingDef; only `citadel` sets it.
   */
  cornerTowerSpriteUrl?: string
}

export const BUILDINGS: Record<string, BuildingDef> = {
  townhall: {
    id: 'townhall',
    name: 'Town Hall',
    description:
      'Seat of the governor. Fills the city treasury each round and directs all construction.',
    category: 'economy',
    cost: {},
    produces: { gold: 100 },
    spriteUrl: '/art/city/townhall.png',
  },
  sawmill: {
    id: 'sawmill',
    name: 'Sawmill',
    description: 'Mills island lumber into timber for construction and shipwork.',
    category: 'economy',
    cost: { gold: 200 },
    produces: { timber: 4 },
    requires: 'townhall',
    spriteUrl: '/art/city/sawmill.png',
  },
  ironmine: {
    id: 'ironmine',
    name: 'Iron Mine',
    description: 'Digs iron from the hills for heavy construction and armament.',
    category: 'economy',
    cost: { gold: 250, timber: 10 },
    produces: { iron: 3 },
    requires: 'townhall',
    spriteUrl: '/art/city/ironmine.png',
  },
  distillery: {
    id: 'distillery',
    name: 'Distillery',
    description: 'Ferments cane into rum — the coin of morale in every port.',
    category: 'economy',
    cost: { gold: 220 },
    produces: { rum: 3 },
    requires: 'townhall',
    spriteUrl: '/art/city/distillery.png',
  },
  tradehouse: {
    id: 'tradehouse',
    name: 'Trade House',
    description: 'Brokers cargo through the harbor, adding gold to the treasury each round.',
    category: 'economy',
    cost: { gold: 350, timber: 15 },
    produces: { gold: 60 },
    requires: 'townhall',
    spriteUrl: '/art/city/tradehouse.png',
  },
  barracks: {
    id: 'barracks',
    name: 'Barracks',
    description: 'Musters the rank and file — opens basic recruitment in this city.',
    category: 'recruitment',
    cost: { gold: 150 },
    produces: {},
    requires: 'townhall',
    unlocksTier: 1,
    spriteUrl: '/art/city/barracks.png',
  },
  garrisonHall: {
    id: 'garrisonHall',
    name: 'Garrison Hall',
    description: 'Houses a standing garrison — opens tier-2 recruitment.',
    category: 'recruitment',
    cost: { gold: 400, timber: 20 },
    produces: {},
    requires: 'barracks',
    unlocksTier: 2,
    spriteUrl: '/art/city/garrisonHall.png',
  },
  fortressArmory: {
    id: 'fortressArmory',
    name: 'Fortress Armory',
    description: 'Arms veteran companies — opens tier-3 recruitment.',
    category: 'recruitment',
    cost: { gold: 900, iron: 30 },
    produces: {},
    requires: 'garrisonHall',
    unlocksTier: 3,
    spriteUrl: '/art/city/fortressArmory.png',
  },
  grandArsenal: {
    id: 'grandArsenal',
    name: 'Grand Arsenal',
    description: 'Outfits the elite of the fleet — opens tier-4 recruitment.',
    category: 'recruitment',
    cost: { gold: 1800, iron: 60, rum: 20 },
    produces: {},
    requires: 'fortressArmory',
    unlocksTier: 4,
    spriteUrl: '/art/city/grandArsenal.png',
  },
  palisade: {
    id: 'palisade',
    name: 'Palisade',
    description: 'A rough timber wall that stiffens the garrison against assault.',
    category: 'fortification',
    cost: { gold: 120, timber: 20 },
    produces: {},
    requires: 'townhall',
    defenseBonus: 10,
    spriteUrl: '/art/city/palisade.png',
  },
  stoneWall: {
    id: 'stoneWall',
    name: 'Stone Wall',
    description: 'Cut-stone ramparts that turn cannon fire and boarding ladders alike.',
    category: 'fortification',
    cost: { gold: 500, iron: 15 },
    produces: {},
    requires: 'palisade',
    defenseBonus: 30,
    spriteUrl: '/art/city/stoneWall.png',
  },
  citadel: {
    id: 'citadel',
    name: 'Citadel',
    description: 'A commanding fortress that anchors the whole city defense.',
    category: 'fortification',
    cost: { gold: 1400, iron: 40 },
    produces: {},
    requires: 'stoneWall',
    defenseBonus: 70,
    spriteUrl: '/art/city/citadel.png',
    cornerTowerSpriteUrl: '/art/city/citadel-tower.png',
  },
  shipyard: {
    id: 'shipyard',
    name: 'Shipyard',
    description:
      'Drydock and rigging crews — refit a docked captain’s hull, guns, sails, and berths.',
    category: 'shipyard',
    cost: { gold: 300, timber: 20 },
    produces: {},
    requires: 'townhall',
    unlocksShipyard: true,
    spriteUrl: '/art/city/shipyard.png',
  },
  tavern: {
    id: 'tavern',
    name: 'Tavern',
    description:
      'Where captains are found — hire new captains, rehire ransomed ones, and manage their orders and skills.',
    category: 'economy',
    cost: { gold: 100 },
    produces: {},
    requires: 'townhall',
    unlocksCaptains: true,
    spriteUrl: '/art/city/tavern.png',
  },
}

/** Buildings every starting city has before the player builds anything. */
export const STARTING_BUILDINGS: readonly string[] = ['townhall', 'barracks']

/**
 * Per-faction flavor names layered over the shared building tree — e.g. the
 * Pirates' "Barracks" is the British "Drill Yard". Falls back to the
 * mechanical name in `BUILDINGS` when a faction has no override.
 *
 * All four recruitment buildings carry a flavor name per faction (#430) —
 * they recruit faction-specific troops, so they're named in each faction's
 * voice. Other buildings stay generic by design, bar the few flavor
 * exceptions that predate that rule (palisade, tavern).
 */
export const FACTION_BUILDING_NAMES: Partial<Record<FactionId, Record<string, string>>> = {
  pirates: {
    barracks: 'Cutthroat Den',
    garrisonHall: "Corsairs' Hold",
    fortressArmory: "Buccaneers' Armory",
    grandArsenal: 'Dread Arsenal',
    palisade: 'Driftwood Barricade',
    tavern: 'Grog House',
  },
  british: {
    barracks: 'Drill Yard',
    garrisonHall: 'Garrison House',
    fortressArmory: 'Royal Armoury',
    grandArsenal: 'Admiralty Arsenal',
    palisade: 'Redoubt',
    tavern: 'The Crown & Anchor',
  },
  spanish: {
    barracks: 'Cuartel',
    garrisonHall: 'Sala de Armas',
    fortressArmory: 'Armería Real',
    grandArsenal: 'Gran Arsenal',
    palisade: 'Empalizada',
    tavern: 'Taberna',
  },
  dutch: {
    barracks: 'Schutterij Hall',
    garrisonHall: 'Garnizoenshuis',
    fortressArmory: 'Wapenkamer',
    grandArsenal: 'Groot Arsenaal',
    palisade: 'Aardwerk',
    tavern: 'Herberg',
  },
  french: {
    barracks: 'Caserne',
    garrisonHall: 'Salle de Garde',
    fortressArmory: 'Armurerie Royale',
    grandArsenal: 'Grand Arsenal Royal',
    palisade: 'Palissade',
    tavern: 'Auberge',
  },
}

/** The display name for a building, honoring per-faction flavor overrides. */
export function buildingDisplayName(buildingId: string, factionId: FactionId): string {
  const override = FACTION_BUILDING_NAMES[factionId]?.[buildingId]
  return override ?? BUILDINGS[buildingId]?.name ?? buildingId
}
