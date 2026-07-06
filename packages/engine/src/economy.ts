import { addResources, coordsEqual, EMPTY_RESOURCES, type ResourcePool } from '@aop/shared'
import type { ContentCatalog } from './content'
import type { CityState, GameState } from './types'

/** Per-round production of a single city, summed over its standing buildings. */
export function cityIncome(city: CityState, catalog: ContentCatalog): ResourcePool {
  return city.buildings.reduce((total, buildingId) => {
    const def = catalog.buildings[buildingId]
    return def ? addResources(total, def.produces) : total
  }, EMPTY_RESOURCES)
}

/**
 * Per-round production from authored resource nodes (#101, #211): an ongoing,
 * passive yield (not a one-time pickup, and not tied to city proximity) to
 * whichever player controls the node's tile. Control resolves as:
 *
 * 1. Captains standing on the tile take control. If several co-occupy it, the
 *    node's authored `ownerSeat` player wins when among them; otherwise the
 *    occupant earliest in `GameState.captains` order (deterministic — array
 *    order is part of replayable state).
 * 2. With no occupant, control falls back to the `ownerSeat` player. This is
 *    the only way a land node yields: captains are water-bound, so a land
 *    tile can never be occupied.
 * 3. A node with no occupant and no `ownerSeat` is neutral and yields nothing,
 *    as does one whose kind has no catalog entry.
 *
 * Determined entirely from replayable state — no RNG involved.
 */
export function resourceNodeIncome(
  state: GameState,
  playerId: string,
  catalog: ContentCatalog,
): ResourcePool {
  return state.resourceNodes.reduce((total, node) => {
    const def = catalog.resourceNodes?.[node.kind]
    if (!def) return total
    const ownerId = node.ownerSeat !== undefined ? state.players[node.ownerSeat]?.id : undefined
    const occupants = state.captains.filter((c) => coordsEqual(c.position, node.position))
    const controllerId =
      occupants.length > 0
        ? ownerId !== undefined && occupants.some((c) => c.ownerId === ownerId)
          ? ownerId
          : occupants[0]!.ownerId
        : ownerId
    if (controllerId !== playerId) return total
    return addResources(total, def.yield)
  }, EMPTY_RESOURCES)
}

/** Total per-round production across every city a player owns, plus any resource nodes they control. */
export function playerIncome(
  state: GameState,
  playerId: string,
  catalog: ContentCatalog,
): ResourcePool {
  const cityTotal = state.cities
    .filter((c) => c.ownerId === playerId)
    .reduce((total, city) => addResources(total, cityIncome(city, catalog)), EMPTY_RESOURCES)
  return addResources(cityTotal, resourceNodeIncome(state, playerId, catalog))
}

/** Highest unit recruitment tier unlocked by a city's standing buildings (0 = none). */
export function unlockedRecruitTier(city: CityState, catalog: ContentCatalog): number {
  return city.buildings.reduce((max, id) => {
    const tier = catalog.buildings[id]?.unlocksTier ?? 0
    return Math.max(max, tier)
  }, 0)
}

/**
 * Weekly-growth style replenishment: every unit of `factionId` whose tier is
 * unlocked by the city gains its `weeklyGrowth` in available recruits.
 */
export function replenishAvailability(
  city: CityState,
  factionId: string,
  catalog: ContentCatalog,
): Record<string, number> {
  const tier = unlockedRecruitTier(city, catalog)
  const next = { ...city.unitAvailability }
  for (const [unitId, def] of Object.entries(catalog.units)) {
    if (def.factionId === factionId && def.tier <= tier) {
      next[unitId] = (next[unitId] ?? 0) + def.weeklyGrowth
    }
  }
  return next
}
