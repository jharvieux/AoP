import {
  BUILDINGS,
  CAPTAIN_XP_THRESHOLDS,
  ENCOUNTERS,
  FACTIONS,
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
  }
}
