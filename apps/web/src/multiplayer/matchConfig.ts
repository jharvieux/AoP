import { AI_TUNING, FACTIONS, GAME_SETUP, combatStatsData } from '@aop/content'
import type { FactionId } from '@aop/shared'
import type { GameConfig, PlayerConfig, TroopStack } from '@aop/engine'
import { buildCatalog } from '../catalog'

/**
 * Client-side twin of `buildMatchConfig` in
 * `supabase/functions/_shared/catalog.ts` — must stay byte-for-byte identical,
 * or a client-rebuilt replay (#147) would start from a different `GameConfig`
 * than the one the server actually ran and diverge from the real match.
 * `apps/web/src/catalog.ts`'s `buildCatalog()` and its server twin are pinned
 * equal by `apps/web/src/multiplayer/catalogParity.test.ts` (#250 — they
 * drifted on `resourceNodes` once already).
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
  /** Host-chosen captivity window in rounds (#309); overrides `GAME_SETUP.captainCaptivityRounds`. */
  captainCaptivityRounds?: number | undefined
  /** Host preference (#305). Multiplayer's interactive Tactical UI doesn't exist yet — see #321. */
  battleResolution?: 'tactical' | 'auto' | undefined
  /** Host-chosen round cap (#508); absent = unlimited, the pre-#508 behavior. */
  roundLimit?: number | undefined
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
  topology?: GameConfig['topology'],
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
    // Absent means square (#389) — settings stored before the field existed
    // must rebuild the exact map pre-#389 start-match generated.
    ...(topology ? { topology } : {}),
    players,
    setup: {
      ...GAME_SETUP,
      betrayalReputationPenalty:
        setupOverrides.betrayalReputationPenalty ?? GAME_SETUP.betrayalReputationPenalty,
      betrayalTruceRounds: setupOverrides.betrayalTruceRounds ?? GAME_SETUP.betrayalTruceRounds,
      captainCaptivityRounds:
        setupOverrides.captainCaptivityRounds ?? GAME_SETUP.captainCaptivityRounds,
      battleResolution: setupOverrides.battleResolution ?? GAME_SETUP.battleResolution ?? 'auto',
      // Round cap (#508): the key must stay absent when unset — GAME_SETUP
      // carries no default, and pre-#508 matches must rebuild byte-identical.
      ...(setupOverrides.roundLimit !== undefined ? { roundLimit: setupOverrides.roundLimit } : {}),
    },
    combatStats: combatStatsData(),
    content: buildCatalog(),
    aiTuning: AI_TUNING,
  }
}
