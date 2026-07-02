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
