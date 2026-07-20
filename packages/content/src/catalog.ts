import { BUILDINGS } from './buildings'
import { ENCOUNTERS } from './encounters'
import { FACTIONS } from './factions'
import { LAND_ENCOUNTERS } from './landEncounters'
import { LAND_SITES } from './landSites'
import { ITEMS, ITEM_DROPS } from './items'
import { RESOURCE_NODES } from './resourceNodes'
import { SHIP_CLASSES } from './ships'
import { CAPTAIN_XP_THRESHOLDS, SKILLS } from './skills'
import {
  CAPTAIN_STAT_TUNING,
  CITY_DEFENSE_TUNING,
  INLAND_SETTLEMENTS,
  RECRUIT_REPLENISH_INTERVAL,
} from './tuning'

/**
 * Assemble the engine's `ContentCatalog` shape from the raw `@aop/content` data.
 *
 * Single source of truth for what used to be three hand-mirrored copies —
 * `apps/web/src/catalog.ts`, `supabase/functions/_shared/catalog.ts`, and
 * `packages/tools/src/land-battery.ts` (#552; they'd already silently
 * drifted once on `resourceNodes`, see #250). Those three now import and
 * re-export/call this function instead of redefining it.
 *
 * Not typed against `@aop/engine`'s `ContentCatalog` here — `@aop/content`
 * must not depend on `@aop/engine` (the engine stays dependency-free and
 * only content flows into it, never the reverse). Callers that need the
 * `ContentCatalog` type annotate their own wrapper; the shape below is
 * structurally identical to it.
 */
export function buildContentCatalog() {
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
