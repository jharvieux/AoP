import { FACTIONS } from '@aop/content'
import type { AiProfile, PlayerConfig, TroopStack } from '@aop/engine'
import type { FactionId } from '@aop/shared'

/**
 * Default-player helpers shared by any screen that assembles a `players`
 * list for `createGame` — the normal setup flow (NewGameSetup) and the map
 * editor's test-play flow (#41) both need "seat N gets a sane default
 * faction/troops" without duplicating the logic twice.
 */

export const FACTIONS_ARRAY = Object.values(FACTIONS)

const DEFAULT_AI_PROFILE: AiProfile = { personality: 'opportunist', difficulty: 'normal' }

function getDefaultFaction(index: number): FactionId {
  const faction = FACTIONS_ARRAY[index % FACTIONS_ARRAY.length]
  if (!faction) throw new Error('No factions available')
  return faction.id
}

/** Starting crew for a faction's captain, drawn from its tier-1 unit in @aop/content. */
export function starterTroops(faction: FactionId): TroopStack[] {
  const unit = FACTIONS[faction].units[0]
  if (!unit) throw new Error(`Faction ${faction} has no units`)
  return [{ unitId: unit.id, count: 6 }]
}

export function createDefaultPlayer(index: number): PlayerConfig {
  const isAI = index !== 0
  return {
    id: index === 0 ? 'player-0' : `ai-${index}`,
    name: index === 0 ? 'You' : `Captain ${index}`,
    faction: getDefaultFaction(index),
    isAI,
    ...(isAI ? { aiProfile: { ...DEFAULT_AI_PROFILE } } : {}),
  }
}
