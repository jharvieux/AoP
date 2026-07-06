import {
  AI_TUNING,
  BUILDINGS,
  CAPTAIN_XP_THRESHOLDS,
  ENCOUNTERS,
  FACTIONS,
  GAME_SETUP,
  RESOURCE_NODES,
  SHIP_CLASSES,
  SKILLS,
  combatStatsData,
} from '@aop/content'
import type { FactionId } from '@aop/shared'
import type { ContentCatalog, GameConfig, PlayerConfig, TroopStack } from '@aop/engine'

/**
 * Assemble the engine's ContentCatalog from @aop/content — the server-side twin
 * of apps/web/src/catalog.ts. The engine must stay dependency-free, so the
 * caller (here, the Edge Function) freezes this snapshot into the match config;
 * the client does the same, and both sides run the identical engine (§2).
 */
export function buildCatalog(): ContentCatalog {
  return {
    buildings: BUILDINGS,
    units: Object.fromEntries(
      Object.values(FACTIONS).flatMap((faction) =>
        faction.units.map((unit) => [
          unit.id,
          {
            factionId: faction.id,
            tier: unit.tier,
            goldCost: unit.goldCost,
            weeklyGrowth: unit.weeklyGrowth,
            attack: unit.attack,
            defense: unit.defense,
            health: unit.health,
          },
        ]),
      ),
    ),
    ships: Object.fromEntries(
      SHIP_CLASSES.map((ship) => [
        ship.id,
        {
          hull: ship.hull,
          cannons: ship.cannons,
          speed: ship.speed,
          crewCapacity: ship.crewCapacity,
          upgrades: ship.upgrades,
        },
      ]),
    ),
    skills: Object.fromEntries(
      Object.values(SKILLS).map((skill) => [
        skill.id,
        {
          factionId: skill.factionId,
          tier: skill.tier,
          attackBonusPct: skill.attackBonusPct,
          defenseBonusPct: skill.defenseBonusPct,
        },
      ]),
    ),
    captainXpThresholds: [...CAPTAIN_XP_THRESHOLDS],
    encounters: ENCOUNTERS,
    // #250: this used to be omitted here while the client twin
    // (apps/web/src/catalog.ts) included it — a real drift, not the "known,
    // currently-inert" divergence #169 claimed (community/editor maps already
    // set `mapDefinition.resourceNodes`, and the server is the one that runs
    // multiplayer authority). Kept in sync with the client twin by the golden
    // test in catalog.test.ts.
    resourceNodes: Object.fromEntries(
      Object.values(RESOURCE_NODES).map((node) => [node.id, { yield: node.yield }]),
    ),
  }
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
