/**
 * Shared types and utilities used by the engine, content, client, and
 * (later) Supabase Edge Functions. Must stay free of runtime dependencies.
 */

export type FactionId = 'pirates' | 'british' | 'spanish' | 'dutch'

export const FACTION_IDS: readonly FactionId[] = ['pirates', 'british', 'spanish', 'dutch']

export type MapSize = 'small' | 'medium' | 'large'

export interface ResourcePool {
  gold: number
  timber: number
  iron: number
  rum: number
}

export const EMPTY_RESOURCES: ResourcePool = { gold: 0, timber: 0, iron: 0, rum: 0 }

export function addResources(a: ResourcePool, b: Partial<ResourcePool>): ResourcePool {
  return {
    gold: a.gold + (b.gold ?? 0),
    timber: a.timber + (b.timber ?? 0),
    iron: a.iron + (b.iron ?? 0),
    rum: a.rum + (b.rum ?? 0),
  }
}
