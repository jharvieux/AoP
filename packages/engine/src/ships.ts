import type { ShipLike } from './content'

/**
 * A ship class's stats. Hull/cannons feed real ship-to-ship combat and
 * speed feeds map movement once those systems land (#4/#8); until then
 * this is display data plus the input `boostedCatalog`-style bonuses would
 * apply to. crewCapacity is already load-bearing today, gating how many
 * troops a captain can carry aboard.
 */
export interface ShipStats {
  hull: number
  cannons: number
  speed: number
  crewCapacity: number
}

/** A ship class's stock stats with purchased upgrade levels (#22) layered on. */
export function effectiveShipStats(
  ship: ShipLike,
  upgradeLevels: Record<string, number>,
): ShipStats {
  const stats: ShipStats = {
    hull: ship.hull,
    cannons: ship.cannons,
    speed: ship.speed,
    crewCapacity: ship.crewCapacity,
  }
  for (const [track, level] of Object.entries(upgradeLevels)) {
    const levels = ship.upgrades[track]
    if (!levels) continue
    for (let i = 0; i < level && i < levels.length; i++) {
      const key = track as keyof ShipStats
      stats[key] += levels[i]!.amount
    }
  }
  return stats
}

/** Gold cost to buy the next level on a track, or undefined if unknown/already maxed. */
export function nextUpgradeCost(
  ship: ShipLike,
  track: string,
  currentLevel: number,
): number | undefined {
  return ship.upgrades[track]?.[currentLevel]?.goldCost
}
