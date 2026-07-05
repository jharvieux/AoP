import { FACTIONS } from './factions'
import { SHIP_CLASSES } from './ships'
import {
  BATTLE_TUNING,
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
  const units: UnitCombatStats[] = Object.values(FACTIONS).flatMap((faction) =>
    faction.units.map((u) => ({
      id: u.id,
      attack: u.attack,
      defense: u.defense,
      health: u.health,
      speed: u.speed,
      ...(u.range !== undefined ? { range: u.range } : {}),
    })),
  )
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
