import { AI_TUNING, FACTIONS, GAME_SETUP, combatStatsData } from '@aop/content'
import type { FactionId } from '@aop/shared'
import type { GameConfig, PlayerConfig, TroopStack } from '@aop/engine'
import { buildCatalog } from '../catalog'

/**
 * Client-side twin of `buildMatchConfig` in
 * `supabase/functions/_shared/catalog.ts` — must stay byte-for-byte identical,
 * or a client-rebuilt replay (#147) would start from a different `GameConfig`
 * than the one the server actually ran and diverge from the real match.
 */
function starterTroops(faction: FactionId): TroopStack[] {
  const unit = FACTIONS[faction].units[0]
  if (!unit) throw new Error(`Faction ${faction} has no units`)
  return [{ unitId: unit.id, count: 6 }]
}

/** A seat as stored in `match_players`, in the shape `buildMatchConfig` needs. */
export interface SeatConfig {
  seat: number
  faction: FactionId
  isAI: boolean
  displayName: string
}

/**
 * Rebuilds the frozen `GameConfig` a match started from, from its persisted
 * seed/mapSize/seats — the same assembly the `start-match` Edge Function runs
 * server-side (docs/MULTIPLAYER.md §5, §10). Seat identity, not user id, is
 * the engine's player id, so this needs no auth-scoped data beyond what
 * `match_players` already exposes to seated participants.
 */
export function buildMatchConfig(
  seed: number,
  mapSize: GameConfig['mapSize'],
  seats: SeatConfig[],
): GameConfig {
  const players: PlayerConfig[] = seats.map((s) => ({
    id: `seat-${s.seat}`,
    name: s.displayName,
    faction: s.faction,
    isAI: s.isAI,
    startingTroops: starterTroops(s.faction),
  }))
  return {
    seed,
    mapSize,
    players,
    setup: GAME_SETUP,
    combatStats: combatStatsData(),
    content: buildCatalog(),
    aiTuning: AI_TUNING,
  }
}
