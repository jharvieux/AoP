import type { ResourcePool } from '@aop/shared'

/**
 * Balance data for land resource sites (#466) — features the map generator
 * scatters across island `land` tiles, worth landing a party for. Two
 * behaviours, chosen per site type (operator decision, epic #469):
 *
 * - **hold**: an ongoing per-round yield to whoever last *claimed* the site.
 *   The claim is a persistent marker on the site (see engine `LandSiteState`):
 *   it keeps paying after the claiming party marches away, and only changes
 *   hands when an enemy party captures the site in turn. Mines (gold + iron)
 *   and sawmills (timber) are hold sites.
 * - **haul**: a one-time payout the moment a party captures the site, after
 *   which the site is spent and never yields again. Lumber camps and ruins are
 *   haul sites.
 *
 * Pure content data — the engine holds none of it, and the client/edge
 * functions freeze this into the match config exactly like the encounter and
 * economy tables. The yield is deliberately modest against a city's building
 * income: the cost of a hold site is parking troops ashore to take and defend
 * it, and it disappears the instant a rival party marches in.
 */
export type LandSiteKind = 'mine' | 'sawmill' | 'lumberCamp' | 'ruins'

export type LandSiteMode = 'hold' | 'haul'

export interface LandSiteDef {
  id: LandSiteKind
  name: string
  /** 'hold' = ongoing yield each round while claimed; 'haul' = one-time payout on capture. */
  mode: LandSiteMode
  /** hold → resources per round while claimed; haul → the one-time capture payout. */
  yield: Partial<ResourcePool>
  /** Relative weight for the seeded kind roll at map generation (higher = more common). */
  weight: number
}

export interface LandSiteCatalog {
  sites: Record<LandSiteKind, LandSiteDef>
  /** Sites spawned ≈ floor(landTiles * spawnDensity). */
  spawnDensity: number
  /** Keep sites this many tiles clear of any start position so no start hands out free income. */
  minStartDistance: number
}

export const LAND_SITES: LandSiteCatalog = {
  sites: {
    // Hold sites: ongoing income while the claim marker stands.
    mine: { id: 'mine', name: 'Gold Mine', mode: 'hold', yield: { gold: 40, iron: 3 }, weight: 3 },
    sawmill: { id: 'sawmill', name: 'Sawmill', mode: 'hold', yield: { timber: 5 }, weight: 3 },
    // Haul sites: a single payout on capture, then spent.
    lumberCamp: { id: 'lumberCamp', name: 'Lumber Camp', mode: 'haul', yield: { timber: 45 }, weight: 2 }, // prettier-ignore
    ruins: {
      id: 'ruins',
      name: 'Old Ruins',
      mode: 'haul',
      yield: { gold: 240, rum: 8 },
      weight: 2,
    },
  },
  spawnDensity: 0.05,
  minStartDistance: 3,
}
