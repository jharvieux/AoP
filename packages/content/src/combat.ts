import { turretUnitId } from '@aop/shared'
import { FACTIONS, type UnitDef } from './factions'
import { SHIP_CLASSES } from './ships'
import {
  BATTLE_TUNING,
  CITY_DEFENSE_TUNING,
  COMBAT_TUNING,
  TACTICS_TUNING,
  type BattleTuning,
  type CombatTuning,
  type TacticsTuning,
} from './tuning'

/**
 * Combat-relevant stats derived from the content rosters, in the plain shape the
 * engine's `createCombatStats` expects (see @aop/engine `CombatStatsData`). This
 * keeps all balance numbers here in @aop/content — the engine holds none — while
 * letting a match freeze a snapshot of them for replay determinism.
 */
export interface UnitCombatStats {
  id: string
  attack: number
  defense: number
  health: number
  /** Battle-board speed (#39): hexes per activation and initiative rank. */
  speed: number
  /** Battle-board attack range in hexes (#94); omitted/1 = melee, 2+ = ranged. */
  range?: number
  /** A stationary defender piece (#435) — a city turret; deploys but never moves. */
  stationary?: boolean
}

/**
 * The highest-tier unit a city recruiting up to `maxTier` can field — the unit a
 * defensive turret's stats derive from (#435). Ties (two units at the same top
 * tier) break to the tougher one, then by id, so the choice is deterministic.
 */
function highestUnitUpToTier(units: readonly UnitDef[], maxTier: number): UnitDef | undefined {
  return units
    .filter((u) => u.tier <= maxTier)
    .reduce<UnitDef | undefined>((best, u) => {
      if (!best) return u
      if (u.tier !== best.tier) return u.tier > best.tier ? u : best
      if (u.health !== best.health) return u.health > best.health ? u : best
      return u.id < best.id ? u : best
    }, undefined)
}

/**
 * Synthetic turret units (#435), one per (faction, unlocked recruit tier), baked
 * into the combat snapshot so every consumer that resolves board stats — the
 * battle resolver, the AI's assault scoring, the client's strength preview —
 * reads a turret's numbers from the same frozen source. Turret stats are derived
 * from the faction's highest available unit and scaled by the city-defense
 * tuning knobs; the turret is a stationary, ranged, destructible piece.
 */
function turretUnitStats(): UnitCombatStats[] {
  const cd = CITY_DEFENSE_TUNING
  const out: UnitCombatStats[] = []
  for (const faction of Object.values(FACTIONS)) {
    const tiers = [...new Set(faction.units.map((u) => u.tier))].sort((a, b) => a - b)
    for (const tier of tiers) {
      const rep = highestUnitUpToTier(faction.units, tier)
      if (!rep) continue
      out.push({
        id: turretUnitId(faction.id, tier),
        attack: Math.round(rep.attack * cd.turretAttackMult),
        defense: Math.round(rep.defense * cd.turretDefenseMult),
        health: Math.round(rep.health * cd.turretHealthMult),
        speed: cd.turretSpeed,
        range: cd.turretRange,
        stationary: true,
      })
    }
  }
  return out
}

export interface ShipCombatStats {
  id: string
  hull: number
  cannons: number
  speed: number
}

export interface CombatStatsData {
  units: UnitCombatStats[]
  ships: ShipCombatStats[]
  combat: CombatTuning
  tactics: TacticsTuning
  battle: BattleTuning
}

export function combatStatsData(): CombatStatsData {
  const units: UnitCombatStats[] = Object.values(FACTIONS)
    .flatMap((faction) =>
      faction.units.map((u) => ({
        id: u.id,
        attack: u.attack,
        defense: u.defense,
        health: u.health,
        speed: u.speed,
        ...(u.range !== undefined ? { range: u.range } : {}),
      })),
    )
    .concat(turretUnitStats())
  const ships: ShipCombatStats[] = SHIP_CLASSES.map((s) => ({
    id: s.id,
    hull: s.hull,
    cannons: s.cannons,
    speed: s.speed,
  }))
  return {
    units,
    ships,
    combat: COMBAT_TUNING,
    tactics: TACTICS_TUNING,
    battle: BATTLE_TUNING,
  }
}
