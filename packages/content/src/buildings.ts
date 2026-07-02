import type { ResourcePool } from '@aop/shared'

/**
 * Building tree shared by all factions (per-faction flavor can layer on
 * later without changing this shape). `requires` names a prerequisite
 * building id in the same city — the construction action enforces it.
 */

export type BuildingCategory = 'economy' | 'recruitment' | 'fortification'

export interface BuildingDef {
  id: string
  name: string
  category: BuildingCategory
  /** Construction cost. */
  cost: Partial<ResourcePool>
  /** Resources produced each round this building is standing. */
  produces: Partial<ResourcePool>
  /** Prerequisite building id, if any. */
  requires?: string
}

export const BUILDINGS: Record<string, BuildingDef> = {
  townhall: {
    id: 'townhall',
    name: 'Town Hall',
    category: 'economy',
    cost: {},
    produces: { gold: 100 },
  },
  sawmill: {
    id: 'sawmill',
    name: 'Sawmill',
    category: 'economy',
    cost: { gold: 200 },
    produces: { timber: 4 },
    requires: 'townhall',
  },
  ironmine: {
    id: 'ironmine',
    name: 'Iron Mine',
    category: 'economy',
    cost: { gold: 250, timber: 10 },
    produces: { iron: 3 },
    requires: 'townhall',
  },
  distillery: {
    id: 'distillery',
    name: 'Distillery',
    category: 'economy',
    cost: { gold: 220 },
    produces: { rum: 3 },
    requires: 'townhall',
  },
  tradehouse: {
    id: 'tradehouse',
    name: 'Trade House',
    category: 'economy',
    cost: { gold: 350, timber: 15 },
    produces: { gold: 60 },
    requires: 'townhall',
  },
}

/** Buildings every starting city has before the player builds anything. */
export const STARTING_BUILDINGS: readonly string[] = ['townhall']
