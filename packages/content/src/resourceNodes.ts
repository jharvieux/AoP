import type { ResourcePool } from '@aop/shared'

/**
 * Balance data for author-placed map resource nodes (#41 map editor, #101).
 * Unlike a `BuildingDef`, a node has no construction cost and no owner until a
 * captain claims its tile by standing on it — the yield is deliberately more
 * modest than an equivalent-tier building's `produces` (see buildings.ts):
 * the "cost" here is the opportunity cost of parking a captain to hold it,
 * and the yield disappears the instant a rival captain takes the tile.
 */
export type ResourceNodeKind = 'gold' | 'timber' | 'iron' | 'rum'

export interface ResourceNodeDef {
  id: ResourceNodeKind
  name: string
  /** Resources produced each round this node is controlled (see economy.ts's resourceNodeIncome). */
  yield: Partial<ResourcePool>
}

export const RESOURCE_NODES: Record<ResourceNodeKind, ResourceNodeDef> = {
  gold: { id: 'gold', name: 'Gold Vein', yield: { gold: 50 } },
  timber: { id: 'timber', name: 'Timber Stand', yield: { timber: 3 } },
  iron: { id: 'iron', name: 'Iron Deposit', yield: { iron: 2 } },
  rum: { id: 'rum', name: 'Rum Cache', yield: { rum: 2 } },
}
