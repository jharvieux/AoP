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

/**
 * Per-level refit strength as a fraction of the ship class's own base stat
 * (#462): +10% / +15% / +25%, so a fully-refitted hull ends ~+50% on every
 * track regardless of class — instead of a flat bonus that meant little on a
 * galleon and a lot on a sloop.
 */
const UPGRADE_PCT = [0.1, 0.15, 0.25] as const

/** Base gold cost per track/level, before the class-specific scale multiplier. */
const UPGRADE_COST: Record<ShipUpgradeTrack, readonly [number, number, number]> = {
  hull: [150, 350, 700],
  cannons: [180, 400, 800],
  speed: [200, 450, 900],
  crewCapacity: [220, 500, 1000],
}

/**
 * The upgrade table for one ship class. Each level's stat gain is a percentage
 * of that class's base stat (see {@link UPGRADE_PCT}), pre-computed here to a
 * whole number — rounded half-up, then floored at +1 so no purchasable level is
 * ever a no-op — and stored as the flat `amount` the engine's `upgradeShip`
 * reducer already applies (the reducer stays untouched). The +1 floor bites the
 * speed track on low-speed hulls, where a small percentage of a tiny base rounds
 * to zero; those levels degenerate to flat +1s (enumerated in #462). Cost scales
 * with the class multiplier so bigger hulls cost more to refit.
 */
function upgradeTable(
  base: Pick<ShipClassDef, 'hull' | 'cannons' | 'speed' | 'crewCapacity'>,
  scale: number,
): Record<ShipUpgradeTrack, ShipUpgradeLevel[]> {
  const track = (t: ShipUpgradeTrack, baseStat: number): ShipUpgradeLevel[] =>
    UPGRADE_PCT.map((pct, i) => ({
      goldCost: Math.round(UPGRADE_COST[t][i]! * scale),
      amount: Math.max(1, Math.round(pct * baseStat)),
    }))
  return {
    hull: track('hull', base.hull),
    cannons: track('cannons', base.cannons),
    speed: track('speed', base.speed),
    crewCapacity: track('crewCapacity', base.crewCapacity),
  }
}

/** Assemble a ship class from its base stats, wiring up its percentage-of-base upgrade table. */
function shipClass(
  id: string,
  name: string,
  base: { hull: number; cannons: number; speed: number; crewCapacity: number },
  goldCost: number,
  scale: number,
): ShipClassDef {
  return { id, name, ...base, goldCost, upgrades: upgradeTable(base, scale) }
}

export const SHIP_CLASSES: ShipClassDef[] = [
  // Troop capacities (#462): a landing party capped by crew capacity could not
  // approach a garrisoned city's defence, so conquest needed both bigger holds
  // and attrition (see AI_TUNING.attritionMinRatio). Bases sloop 25 / brigantine
  // 50 / frigate 100 / galleon 200.
  shipClass('sloop', 'Sloop', { hull: 40, cannons: 6, speed: 5, crewCapacity: 25 }, 400, 1),
  shipClass(
    'brigantine',
    'Brigantine',
    { hull: 70, cannons: 12, speed: 4, crewCapacity: 50 },
    900,
    1.5,
  ),
  shipClass(
    'frigate',
    'Frigate',
    { hull: 110, cannons: 24, speed: 3, crewCapacity: 100 },
    1800,
    2.25,
  ),
  shipClass('galleon', 'Galleon', { hull: 160, cannons: 36, speed: 2, crewCapacity: 200 }, 3200, 3),
]
