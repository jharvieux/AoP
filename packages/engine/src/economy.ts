import { addResources, EMPTY_RESOURCES, type ResourcePool } from '@aop/shared'
import type { ContentCatalog } from './content'
import type { CityState, GameState } from './types'

/** Per-round production of a single city, summed over its standing buildings. */
export function cityIncome(city: CityState, catalog: ContentCatalog): ResourcePool {
  return city.buildings.reduce((total, buildingId) => {
    const def = catalog.buildings[buildingId]
    return def ? addResources(total, def.produces) : total
  }, EMPTY_RESOURCES)
}

/** Total per-round production across every city a player owns. */
export function playerIncome(
  state: GameState,
  playerId: string,
  catalog: ContentCatalog,
): ResourcePool {
  return state.cities
    .filter((c) => c.ownerId === playerId)
    .reduce((total, city) => addResources(total, cityIncome(city, catalog)), EMPTY_RESOURCES)
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
