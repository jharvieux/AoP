import type { ItemCatalogLike } from './content'
import { nextFloat, type RngState } from './rng'

/**
 * Item drops (#498): a seeded chance roll followed by a weighted pick over the
 * catalog's item table. Both draws come from the GameState RNG stream the
 * caller threads through, so drops replay identically everywhere. A miss
 * consumes exactly one draw, a hit exactly two — deterministic either way.
 */
export interface ItemDropResult {
  /** The dropped item id, or null when the chance roll missed. */
  itemId: string | null
  rng: RngState
}

export function rollItemDrop(
  catalog: ItemCatalogLike,
  chance: number,
  rng: RngState,
): ItemDropResult {
  let [state, roll] = nextFloat(rng)
  if (roll >= chance) return { itemId: null, rng: state }

  // Sorted ids so the pick order never depends on the catalog's key order.
  const ids = Object.keys(catalog.defs).sort()
  const weights = ids.map((id) => Math.max(0, catalog.defs[id]!.weight))
  const total = weights.reduce((sum, w) => sum + w, 0)
  if (ids.length === 0 || total <= 0) return { itemId: null, rng: state }

  let pick: number
  ;[state, pick] = nextFloat(state)
  let cursor = pick * total
  for (let i = 0; i < ids.length; i++) {
    cursor -= weights[i]!
    if (cursor < 0) return { itemId: ids[i]!, rng: state }
  }
  return { itemId: ids[ids.length - 1]!, rng: state }
}
