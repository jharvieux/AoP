import { FACTIONS } from './factions'
import { SHIP_CLASSES } from './ships'

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
}

export function combatStatsData(): CombatStatsData {
  const units: UnitCombatStats[] = Object.values(FACTIONS).flatMap((faction) =>
    faction.units.map((u) => ({
      id: u.id,
      attack: u.attack,
      defense: u.defense,
      health: u.health,
    })),
  )
  const ships: ShipCombatStats[] = SHIP_CLASSES.map((s) => ({
    id: s.id,
    hull: s.hull,
    cannons: s.cannons,
    speed: s.speed,
  }))
  return { units, ships }
}
