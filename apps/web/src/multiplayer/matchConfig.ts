import { AI_TUNING, FACTIONS, GAME_SETUP, combatStatsData } from '@aop/content'
import type { FactionId } from '@aop/shared'
import type { GameConfig, PlayerConfig, TroopStack } from '@aop/engine'
import { buildCatalog } from '../catalog'

/**
 * Client-side twin of `buildMatchConfig` in
 * `supabase/functions/_shared/catalog.ts` — must stay byte-for-byte identical,
 * or a client-rebuilt replay (#147) would start from a different `GameConfig`
 * than the one the server actually ran and diverge from the real match.
 *
 * One known, currently-inert divergence (#169): this client's `buildCatalog()`
 * (`apps/web/src/catalog.ts`) includes a `resourceNodes` field that the
 * server's twin (`supabase/functions/_shared/catalog.ts`) omits. That field
 * only feeds `GameState.resourceNodes`, which the engine seeds exclusively
 * from `GameConfig.mapDefinition` (`packages/engine/src/game.ts`) — and
 * multiplayer matches never set `mapDefinition`, so `state.resourceNodes`
 * stays `[]` on both sides regardless of the catalog difference. Reconcile
 * the two `buildCatalog()`s (or start setting `mapDefinition` here) before
 * relying on this field for anything multiplayer-sourced.
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
 * Host-configurable overrides (#177) applied on top of `GAME_SETUP` when building
 * a match's frozen setup. Undefined fields fall back to the content default, so a
 * match created before these became configurable rebuilds identically. Twin of
 * `MatchSetupOverrides` in `supabase/functions/_shared/catalog.ts`.
 */
export interface MatchSetupOverrides {
  betrayalReputationPenalty?: number | undefined
  betrayalTruceRounds?: number | undefined
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
  setupOverrides: MatchSetupOverrides = {},
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
    setup: {
      ...GAME_SETUP,
      betrayalReputationPenalty:
        setupOverrides.betrayalReputationPenalty ?? GAME_SETUP.betrayalReputationPenalty,
      betrayalTruceRounds: setupOverrides.betrayalTruceRounds ?? GAME_SETUP.betrayalTruceRounds,
    },
    combatStats: combatStatsData(),
    content: buildCatalog(),
    aiTuning: AI_TUNING,
  }
}
