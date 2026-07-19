import { AI_TUNING, FACTIONS, GAME_SETUP, buildContentCatalog, combatStatsData } from '@aop/content'
import type { FactionId } from '@aop/shared'
import type { ContentCatalog, GameConfig, PlayerConfig, TroopStack } from '@aop/engine'

/**
 * Assemble the engine's ContentCatalog from @aop/content — the server-side twin
 * of apps/web/src/catalog.ts. The engine must stay dependency-free, so the
 * caller (here, the Edge Function) freezes this snapshot into the match config;
 * the client does the same, and both sides run the identical engine (§2).
 *
 * The assembly itself now lives in `@aop/content`'s `buildContentCatalog`
 * (#552) — this is a thin, statically-typed wrapper, same as
 * apps/web/src/catalog.ts's `buildCatalog`. See
 * `apps/web/src/multiplayer/catalogParity.test.ts`, which fails the build
 * if the two ever diverge again (#250; they silently drifted on
 * `resourceNodes` once already).
 */
export function buildCatalog(): ContentCatalog {
  return buildContentCatalog()
}

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
 * match created before these became configurable rebuilds identically.
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
 * Build the frozen `GameConfig` a match starts from. Seat identity — not user id
 * — is the engine's player id (§13), so seat reclaim and AI takeover never touch
 * the action log. Seats must be passed in turn order (seat 0 first).
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
