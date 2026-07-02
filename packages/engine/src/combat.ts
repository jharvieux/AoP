import { nextFloat, type RngState } from './rng'
import type { TroopStack } from './types'

/**
 * Combat resolution engine (v1: strength-based auto-resolve).
 *
 * Design goal (#12): a deterministic, multi-round resolver that produces a
 * structured {@link BattleReport}, built so the Phase-2 hybrid tactics layer
 * (#18) plugs in without touching this file. Extensibility is achieved by the
 * {@link TacticChooser} hook: the round engine ({@link resolveRounds}) calls it
 * once per round to obtain each side's damage modifier. v1 supplies a no-op
 * chooser (modifier 1.0); the tactical layer supplies one driven by a
 * tactic-vs-tactic matrix.
 *
 * The engine imports no content — callers inject the numeric stats via
 * {@link createCombatStats}, keeping @aop/engine free of any balance data.
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
}

/** Plain, JSON-serializable snapshot of the combat-relevant content numbers. */
export interface CombatStatsData {
  units: UnitCombatStats[]
  ships: ShipCombatStats[]
}

export interface CombatStats {
  unit(id: string): UnitCombatStats
  ship(id: string): ShipCombatStats
}

export function createCombatStats(data: CombatStatsData): CombatStats {
  const units = new Map(data.units.map((u) => [u.id, u]))
  const ships = new Map(data.ships.map((s) => [s.id, s]))
  return {
    unit(id) {
      const u = units.get(id)
      if (!u) throw new Error(`Unknown unit stats: ${id}`)
      return u
    },
    ship(id) {
      const s = ships.get(id)
      if (!s) throw new Error(`Unknown ship stats: ${id}`)
      return s
    },
  }
}

export interface Combatant {
  captainId: string
  ownerId: string
  shipClassId: string
  troops: TroopStack[]
}

export interface CombatInput {
  attacker: Combatant
  defender: Combatant
}

export interface CombatantSummary {
  ownerId: string
  captainId: string
  shipClassId: string
  strength: number
  troops: TroopStack[]
}

export interface RoundReport {
  round: number
  /** Tactic labels, when a tactical driver is in use; `null` for plain auto-resolve. */
  attackerTactic: string | null
  defenderTactic: string | null
  attackerDamage: number
  defenderDamage: number
  /** Remaining hit points (ship hull + troop health) after the round. */
  attackerHp: number
  defenderHp: number
}

export interface BattleReport {
  attacker: CombatantSummary
  defender: CombatantSummary
  rounds: RoundReport[]
  winnerId: string
  loserId: string
  attackerSurvived: boolean
  defenderSurvived: boolean
  survivingTroops: {
    attacker: TroopStack[]
    defender: TroopStack[]
  }
}

export interface CombatResult {
  report: BattleReport
  /** RNG state after resolution — thread this back into GameState. */
  rng: RngState
  /** Surviving troops, ready to write back onto the captains. */
  attackerTroops: TroopStack[]
  defenderTroops: TroopStack[]
}

/** Per-round modifiers the round engine multiplies into each side's damage. */
export interface RoundTactics {
  attackerTactic: string | null
  defenderTactic: string | null
  attackerModifier: number
  defenderModifier: number
}

export interface RoundView {
  round: number
  attackerStrength: number
  defenderStrength: number
  attackerHp: number
  defenderHp: number
}

export type TacticChooser = (view: RoundView) => RoundTactics

/** v1 chooser: no tactics, no modifiers. */
export const noTactics: TacticChooser = () => ({
  attackerTactic: null,
  defenderTactic: null,
  attackerModifier: 1,
  defenderModifier: 1,
})

const MAX_ROUNDS = 20
const DAMAGE_ROLL_MIN = 0.85
const DAMAGE_ROLL_SPREAD = 0.3
const HULL_STRENGTH_WEIGHT = 0.25
const CANNON_STRENGTH_WEIGHT = 1
const TROOP_DEFENSE_WEIGHT = 0.5

interface Side {
  combatant: Combatant
  troops: TroopStack[]
  hull: number
}

function troopHealth(troops: TroopStack[], stats: CombatStats): number {
  return troops.reduce((sum, t) => sum + t.count * stats.unit(t.unitId).health, 0)
}

function sideHp(side: Side, stats: CombatStats): number {
  return Math.max(0, side.hull) + troopHealth(side.troops, stats)
}

/** Effective fighting strength: ship guns + crew offense. Captain modifier is a v1 stub (×1). */
export function combatantStrength(combatant: Combatant, stats: CombatStats): number {
  const ship = stats.ship(combatant.shipClassId)
  const shipStrength = ship.hull * HULL_STRENGTH_WEIGHT + ship.cannons * CANNON_STRENGTH_WEIGHT
  const troopStrength = combatant.troops.reduce((sum, t) => {
    const u = stats.unit(t.unitId)
    return sum + t.count * (u.attack + u.defense * TROOP_DEFENSE_WEIGHT)
  }, 0)
  const captainModifier = 1
  return (shipStrength + troopStrength) * captainModifier
}

/** Apply `damage` to a side: crew casualties first, then hull. Deterministic. */
function applyDamage(side: Side, damage: number, stats: CombatStats): void {
  const health = troopHealth(side.troops, stats)
  if (damage <= 0) return
  if (damage < health) {
    const scale = (health - damage) / health
    side.troops = side.troops
      .map((t) => ({ unitId: t.unitId, count: Math.round(t.count * scale) }))
      .filter((t) => t.count > 0)
  } else {
    side.troops = []
    side.hull -= damage - health
  }
}

/**
 * The shared round engine. Both the v1 auto-resolver and the tactical resolver
 * call this; only the {@link TacticChooser} differs.
 */
export function resolveRounds(
  input: CombatInput,
  stats: CombatStats,
  rng: RngState,
  chooseTactics: TacticChooser,
): CombatResult {
  const attacker: Side = {
    combatant: input.attacker,
    troops: input.attacker.troops.map((t) => ({ ...t })),
    hull: stats.ship(input.attacker.shipClassId).hull,
  }
  const defender: Side = {
    combatant: input.defender,
    troops: input.defender.troops.map((t) => ({ ...t })),
    hull: stats.ship(input.defender.shipClassId).hull,
  }

  const startAttacker = summarize(input.attacker, stats)
  const startDefender = summarize(input.defender, stats)

  const rounds: RoundReport[] = []
  let state = rng
  let round = 0
  while (round < MAX_ROUNDS && sideHp(attacker, stats) > 0 && sideHp(defender, stats) > 0) {
    round++
    const atkStrength = combatantStrength({ ...attacker.combatant, troops: attacker.troops }, stats)
    const defStrength = combatantStrength({ ...defender.combatant, troops: defender.troops }, stats)

    const tactics = chooseTactics({
      round,
      attackerStrength: atkStrength,
      defenderStrength: defStrength,
      attackerHp: sideHp(attacker, stats),
      defenderHp: sideHp(defender, stats),
    })

    let atkRoll: number
    let defRoll: number
    ;[state, atkRoll] = nextFloat(state)
    ;[state, defRoll] = nextFloat(state)

    const attackerDamage =
      atkStrength * (DAMAGE_ROLL_MIN + atkRoll * DAMAGE_ROLL_SPREAD) * tactics.attackerModifier
    const defenderDamage =
      defStrength * (DAMAGE_ROLL_MIN + defRoll * DAMAGE_ROLL_SPREAD) * tactics.defenderModifier

    applyDamage(defender, attackerDamage, stats)
    applyDamage(attacker, defenderDamage, stats)

    rounds.push({
      round,
      attackerTactic: tactics.attackerTactic,
      defenderTactic: tactics.defenderTactic,
      attackerDamage: round4(attackerDamage),
      defenderDamage: round4(defenderDamage),
      attackerHp: round4(sideHp(attacker, stats)),
      defenderHp: round4(sideHp(defender, stats)),
    })
  }

  const attackerHp = sideHp(attacker, stats)
  const defenderHp = sideHp(defender, stats)
  const attackerSurvived = attackerHp > 0
  // Defender wins ties (attacker failed to break them).
  const attackerWins = attackerSurvived && (defenderHp <= 0 || attackerHp > defenderHp)

  const report: BattleReport = {
    attacker: startAttacker,
    defender: startDefender,
    rounds,
    winnerId: attackerWins ? input.attacker.ownerId : input.defender.ownerId,
    loserId: attackerWins ? input.defender.ownerId : input.attacker.ownerId,
    attackerSurvived,
    defenderSurvived: defenderHp > 0,
    survivingTroops: {
      attacker: attacker.troops,
      defender: defender.troops,
    },
  }

  return {
    report,
    rng: state,
    attackerTroops: attacker.troops,
    defenderTroops: defender.troops,
  }
}

/** v1 strength-based auto-resolve: no tactics, pure ship + crew strength. */
export function resolveCombat(input: CombatInput, stats: CombatStats, rng: RngState): CombatResult {
  return resolveRounds(input, stats, rng, noTactics)
}

function summarize(combatant: Combatant, stats: CombatStats): CombatantSummary {
  return {
    ownerId: combatant.ownerId,
    captainId: combatant.captainId,
    shipClassId: combatant.shipClassId,
    strength: round4(combatantStrength(combatant, stats)),
    troops: combatant.troops.map((t) => ({ ...t })),
  }
}

/** Round to 4 decimals so reports stay stable and JSON-clean across machines. */
function round4(n: number): number {
  return Math.round(n * 10000) / 10000
}
