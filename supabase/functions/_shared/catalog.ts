import {
  AI_TUNING,
  BUILDINGS,
  CAPTAIN_STAT_TUNING,
  CAPTAIN_XP_THRESHOLDS,
  CITY_DEFENSE_TUNING,
  ENCOUNTERS,
  FACTIONS,
  GAME_SETUP,
  INLAND_SETTLEMENTS,
  ITEM_DROPS,
  ITEMS,
  LAND_ENCOUNTERS,
  LAND_SITES,
  RECRUIT_REPLENISH_INTERVAL,
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
 *
 * Kept byte-for-byte identical to apps/web/src/catalog.ts's `buildCatalog` —
 * see `apps/web/src/multiplayer/catalogParity.test.ts`, which fails the build
 * if the two ever diverge again (#250; they silently drifted on
 * `resourceNodes` once already).
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
    resourceNodes: Object.fromEntries(
      Object.values(RESOURCE_NODES).map((node) => [node.id, { yield: node.yield }]),
    ),
    cityDefense: {
      militiaPerType: CITY_DEFENSE_TUNING.militiaPerType,
      turretCount: CITY_DEFENSE_TUNING.turretCount,
      neutralRosterFactionId: CITY_DEFENSE_TUNING.neutralRosterFactionId,
    },
    recruitReplenishInterval: RECRUIT_REPLENISH_INTERVAL,
    landSites: {
      sites: Object.fromEntries(
        Object.values(LAND_SITES.sites).map((s) => [
          s.id,
          { mode: s.mode, yield: s.yield, weight: s.weight },
        ]),
      ),
      spawnDensity: LAND_SITES.spawnDensity,
      minStartDistance: LAND_SITES.minStartDistance,
    },
    landEncounters: {
      nativeVillage: LAND_ENCOUNTERS.nativeVillage,
      hermit: LAND_ENCOUNTERS.hermit,
      banditCamp: LAND_ENCOUNTERS.banditCamp,
      spawnDensity: LAND_ENCOUNTERS.spawnDensity,
      minStartDistance: LAND_ENCOUNTERS.minStartDistance,
    },
    inlandSettlements: {
      density: INLAND_SETTLEMENTS.density,
      buildings: [...INLAND_SETTLEMENTS.buildings],
      minStartDistance: INLAND_SETTLEMENTS.minStartDistance,
    },
    captainStats: {
      attackPerPoint: CAPTAIN_STAT_TUNING.attackPerPoint,
      defensePerPoint: CAPTAIN_STAT_TUNING.defensePerPoint,
      speedMovementPerPoint: CAPTAIN_STAT_TUNING.speedMovementPerPoint,
    },
    items: {
      defs: Object.fromEntries(
        Object.values(ITEMS).map((item) => [
          item.id,
          {
            stats: {
              attack: item.statBonuses.attack ?? 0,
              defense: item.statBonuses.defense ?? 0,
              speed: item.statBonuses.speed ?? 0,
            },
            weight: item.weight,
          },
        ]),
      ),
      captainItemCap: ITEM_DROPS.captainItemCap,
      seaEncounterDropChance: ITEM_DROPS.seaEncounterDropChance,
      landHaulDropChance: ITEM_DROPS.landHaulDropChance,
      landEncounterDropChance: ITEM_DROPS.landEncounterDropChance,
    },
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
