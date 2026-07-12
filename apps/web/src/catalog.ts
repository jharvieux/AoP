import {
  BUILDINGS,
  CAPTAIN_XP_THRESHOLDS,
  CITY_DEFENSE_TUNING,
  ENCOUNTERS,
  FACTIONS,
  INLAND_SETTLEMENTS,
  LAND_ENCOUNTERS,
  LAND_SITES,
  RECRUIT_REPLENISH_INTERVAL,
  RESOURCE_NODES,
  SHIP_CLASSES,
  SKILLS,
} from '@aop/content'
import type { ContentCatalog } from '@aop/engine'

/**
 * Assemble the engine's ContentCatalog from @aop/content. The engine never
 * imports content directly (it must stay dependency-free); the client builds
 * this snapshot and freezes it into the match config, exactly as the multiplayer
 * edge functions will later.
 *
 * Kept byte-for-byte identical to `supabase/functions/_shared/catalog.ts`'s
 * `buildCatalog` — see `apps/web/src/multiplayer/catalogParity.test.ts`, which
 * fails the build if the two ever diverge again (#250; they silently drifted
 * on `resourceNodes` once already).
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
    },
  }
}
