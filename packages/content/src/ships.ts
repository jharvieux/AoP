/**
 * Ship class data, plus per-track upgrade levels purchasable at a city
 * shipyard (#22). Hull/cannons/speed feed real ship-to-ship combat and map
 * movement once those systems land (#4/#8); crewCapacity is already
 * load-bearing today, gating how many troops a captain can carry aboard.
 */

export type ShipUpgradeTrack = 'hull' | 'cannons' | 'speed' | 'crewCapacity'

export const SHIP_UPGRADE_TRACKS: readonly ShipUpgradeTrack[] = [
  'hull',
  'cannons',
  'speed',
  'crewCapacity',
]

export interface ShipUpgradeLevel {
  goldCost: number
  amount: number
}

export interface ShipClassDef {
  id: string
  name: string
  hull: number
  cannons: number
  speed: number
  crewCapacity: number
  goldCost: number
  /** Three purchasable levels per track, ordered — index 0 is the first level. */
  upgrades: Record<ShipUpgradeTrack, ShipUpgradeLevel[]>
}

/** Three-level upgrade table, scaled by a class-specific multiplier so bigger hulls cost more to refit. */
function upgradeTable(scale: number): Record<ShipUpgradeTrack, ShipUpgradeLevel[]> {
  return {
    hull: [
      { goldCost: Math.round(150 * scale), amount: Math.round(15 * scale) },
      { goldCost: Math.round(350 * scale), amount: Math.round(20 * scale) },
      { goldCost: Math.round(700 * scale), amount: Math.round(25 * scale) },
    ],
    cannons: [
      { goldCost: Math.round(180 * scale), amount: Math.round(4 * scale) },
      { goldCost: Math.round(400 * scale), amount: Math.round(6 * scale) },
      { goldCost: Math.round(800 * scale), amount: Math.round(8 * scale) },
    ],
    speed: [
      { goldCost: Math.round(200 * scale), amount: 1 },
      { goldCost: Math.round(450 * scale), amount: 1 },
      { goldCost: Math.round(900 * scale), amount: 1 },
    ],
    crewCapacity: [
      { goldCost: Math.round(220 * scale), amount: 1 },
      { goldCost: Math.round(500 * scale), amount: 1 },
      { goldCost: Math.round(1000 * scale), amount: 2 },
    ],
  }
}

export const SHIP_CLASSES: ShipClassDef[] = [
  {
    id: 'sloop',
    name: 'Sloop',
    hull: 40,
    cannons: 6,
    speed: 5,
    crewCapacity: 4,
    goldCost: 400,
    upgrades: upgradeTable(1),
  },
  {
    id: 'brigantine',
    name: 'Brigantine',
    hull: 70,
    cannons: 12,
    speed: 4,
    crewCapacity: 6,
    goldCost: 900,
    upgrades: upgradeTable(1.5),
  },
  {
    id: 'frigate',
    name: 'Frigate',
    hull: 110,
    cannons: 24,
    speed: 3,
    crewCapacity: 8,
    goldCost: 1800,
    upgrades: upgradeTable(2.25),
  },
  {
    id: 'galleon',
    name: 'Galleon',
    hull: 160,
    cannons: 36,
    speed: 2,
    crewCapacity: 12,
    goldCost: 3200,
    upgrades: upgradeTable(3),
  },
]
