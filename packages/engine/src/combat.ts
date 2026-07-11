import type { BoardBattleLog } from './battleBoard'
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
  /**
   * Board speed (#39): hexes per activation and initiative rank on the tactical
   * battle board. Optional because pre-#39 match snapshots lack it; the board
   * falls back to {@link BattleTuning.defaultUnitSpeed}.
   */
  speed?: number
  /**
   * Attack range in hexes (#94). Absent or 1 means a melee unit (strikes only
   * adjacent enemies). 2+ marks a ranged unit that shoots along a clear line of
   * sight, takes no retaliation at range, and fights at a penalty in melee.
   */
  range?: number
  /**
   * A stationary defender piece (#435): a city turret. It deploys at the
   * defender's edge, fires each round like any ranged unit, but never moves —
   * the board resolver drives it directly instead of asking the side's driver.
   * Only ever set on the synthetic turret units @aop/content bakes into the
   * combat snapshot; real recruitable units never carry it.
   */
  stationary?: boolean
}

export interface ShipCombatStats {
  id: string
  hull: number
  cannons: number
  /** Sailing speed — decides whether a pinning tactic can hold an evader (#18). */
  speed: number
}

/**
 * Tuned weights for the round resolver. Balance data, so it lives in @aop/content
 * (never hardcoded here) and is injected via {@link CombatStatsData}.
 */
export interface CombatTuning {
  maxRounds: number
  damageRollMin: number
  damageRollSpread: number
  hullStrengthWeight: number
  cannonStrengthWeight: number
  troopDefenseWeight: number
  damageScale: number
}

/** Tuned knobs for the hybrid-tactics layer. Balance data, injected like {@link CombatTuning}. */
export interface TacticsTuning {
  advantage: number
  disadvantage: number
  ramHullMin: number
  outgunnedRatio: number
  /** HP ratio below which the default AI driver treats the fight as clearly lost (#212). */
  aiLosingHpRatio: number
  /** Strength ratio the default AI driver needs before it commits to a board (#212). */
  aiBoardStrengthRatio: number
  /** HP ratio below which the aggressive personality breaks off instead of pressing (#212). */
  aggressiveEvadeHpRatio: number
  /** Strength ratio the cautious personality needs before it commits to a board (#212). */
  cautiousBoardStrengthRatio: number
}

/**
 * Tuned knobs for the tactical battle board (#39). Balance data, injected like
 * {@link CombatTuning}. Its presence in a match's frozen stats snapshot is what
 * enables board combat at all — pre-#39 snapshots lack it, so old saves and
 * action logs replay exactly as they always did.
 */
export interface BattleTuning {
  boardWidth: number
  boardHeight: number
  maxStacksPerSide: number
  maxRounds: number
  /** Board speed used for units whose stats predate the speed field. */
  defaultUnitSpeed: number
  damageRollMin: number
  damageRollSpread: number
  /** Damage multiplier slope per point of (attack − defense). */
  attackDefenseFactor: number
  minDamageModifier: number
  maxDamageModifier: number
  /** Damage multiplier when a second friendly stack is adjacent to the target. */
  flankingBonus: number
  /** Fraction of damage absorbed by a target standing on cover terrain. */
  coverDamageReduction: number
  /**
   * Fraction of a ranged shot absorbed by a target standing on cover terrain
   * (#94) — soft cover foils archers more than it blunts a melee blow, so this
   * is typically higher than {@link coverDamageReduction}. Applied in place of
   * (not on top of) the melee cover reduction for ranged shots.
   */
  rangedCoverDamageReduction: number
  /**
   * Damage multiplier for a ranged unit forced to fight an adjacent enemy in
   * melee (#94) — the HoMM archer penalty. Below 1; such a blow also provokes
   * the normal retaliation, unlike a shot at range.
   */
  rangedMeleePenalty: number
  /** Fraction of damage absorbed by a target that held (defensive posture). */
  holdDamageReduction: number
  /** Movement cost of a rough hex (open and cover hexes cost 1). */
  roughMoveCost: number
  boardingBlockedDensity: number
  boardingRoughDensity: number
  boardingCoverDensity: number
  landBlockedDensity: number
  landRoughDensity: number
  landCoverDensity: number
  /** HP ratio at which the 'outnumbered' board standing order fires. */
  outnumberedRatio: number
}

/** Plain, JSON-serializable snapshot of the combat-relevant content numbers. */
export interface CombatStatsData {
  units: UnitCombatStats[]
  ships: ShipCombatStats[]
  combat: CombatTuning
  tactics: TacticsTuning
  /** Absent in pre-#39 snapshots; without it, battles never go to the board. */
  battle?: BattleTuning
}

export interface CombatStats {
  unit(id: string): UnitCombatStats
  ship(id: string): ShipCombatStats
  combat: CombatTuning
  tactics: TacticsTuning
  battle?: BattleTuning
}

export function createCombatStats(data: CombatStatsData): CombatStats {
  const units = new Map(data.units.map((u) => [u.id, u]))
  const ships = new Map(data.ships.map((s) => [s.id, s]))
  const stats: CombatStats = {
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
    combat: data.combat,
    tactics: data.tactics,
  }
  if (data.battle) stats.battle = data.battle
  return stats
}

/** Effective ship stats for a combatant: purchased upgrades (#22) override the class stats. */
export interface EffectiveShip {
  hull: number
  cannons: number
  speed: number
}

export interface Combatant {
  captainId: string
  ownerId: string
  shipClassId: string
  troops: TroopStack[]
  /**
   * Ship stats after this captain's purchased upgrades (#22). Omitted means the
   * flagship is stock and its class stats from {@link CombatStats} are used.
   */
  shipStats?: EffectiveShip
  /** Captain skill (#21) attack bonus as a percentage, applied to this side's troop offense. */
  attackBonusPct?: number
  /** Captain skill (#21) defense bonus as a percentage, applied to this side's troop defense. */
  defenseBonusPct?: number
}

/** Ship stats a combatant actually fights with — upgrades if present, else class stats. */
export function effectiveShip(combatant: Combatant, stats: CombatStats): EffectiveShip {
  if (combatant.shipStats) return combatant.shipStats
  const ship = stats.ship(combatant.shipClassId)
  return { hull: ship.hull, cannons: ship.cannons, speed: ship.speed }
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
  /** ownerId of a side that broke off and fled the battle (flee/escape rules, #18). */
  escapedId: string | null
  survivingTroops: {
    attacker: TroopStack[]
    defender: TroopStack[]
  }
  /** Full hex-board melee record when the battle went to the board (#39). */
  board?: BoardBattleLog
  /**
   * Prize ship (#374): on a decisive naval victory the defeated captain's hull
   * joins the winner's fleet as a new empty-crewed "prize captain". Carries the
   * minted captain's id, its copied ship class, and the winning seat. Absent on
   * an escape or a mutual-survival draw — a prize is minted iff a capture
   * happened.
   */
  prizeShip?: { captainId: string; shipClassId: string; newOwnerId: string }
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

/** Post-round view handed to {@link RoundEndHook}, including the tactics just used. */
export interface RoundEndView {
  round: number
  tactics: RoundTactics
  attackerHp: number
  defenderHp: number
  /** Surviving crews after the round — lets the boarding rule (#39) require live troops. */
  attackerTroops: TroopStack[]
  defenderTroops: TroopStack[]
}

/**
 * What a {@link RoundEndHook} may signal: an ownerId string marks that side as
 * having escaped (flee rules, #18); `{ halt: true }` stops the gunnery loop so
 * the caller can resolve the rest of the battle itself (the boarding
 * transition to the battle board, #39); null continues the fight.
 */
export type RoundEndSignal = string | { halt: true } | null

/**
 * Optional hook the round engine calls after each round's damage is applied,
 * while both sides still float. See {@link RoundEndSignal} for what it may do.
 */
export type RoundEndHook = (view: RoundEndView) => RoundEndSignal

/** v1 chooser: no tactics, no modifiers. */
export const noTactics: TacticChooser = () => ({
  attackerTactic: null,
  defenderTactic: null,
  attackerModifier: 1,
  defenderModifier: 1,
})

interface Side {
  combatant: Combatant
  troops: TroopStack[]
  hull: number
  /** Running crew-health pool: total troop health minus damage taken so far (#210). */
  troopHp: number
}

function troopHealth(troops: TroopStack[], stats: CombatStats): number {
  return troops.reduce((sum, t) => sum + t.count * stats.unit(t.unitId).health, 0)
}

function sideHp(side: Side): number {
  return Math.max(0, side.hull) + side.troopHp
}

/**
 * Effective fighting strength: ship guns + crew offense. Ship stats come from the
 * combatant's purchased upgrades (#22) if present, and captain skill bonuses (#21)
 * scale the crew's attack and defense contributions.
 */
export function combatantStrength(combatant: Combatant, stats: CombatStats): number {
  const ship = effectiveShip(combatant, stats)
  const shipStrength =
    ship.hull * stats.combat.hullStrengthWeight + ship.cannons * stats.combat.cannonStrengthWeight
  const attackScale = 1 + (combatant.attackBonusPct ?? 0) / 100
  const defenseScale = 1 + (combatant.defenseBonusPct ?? 0) / 100
  const troopStrength = combatant.troops.reduce((sum, t) => {
    const u = stats.unit(t.unitId)
    return (
      sum +
      t.count *
        (u.attack * attackScale + u.defense * defenseScale * stats.combat.troopDefenseWeight)
    )
  }, 0)
  return shipStrength + troopStrength
}

/**
 * Apply `damage` to a side: crew casualties first, then hull. Casualties are
 * drawn against the side's running crew-health pool, so damage below the pool
 * can never annihilate the crew (#210) — the old proportional per-stack
 * `Math.round` could wipe a small stack on sub-lethal damage, or kill nobody
 * on repeated near-lethal hits. Stack counts are rebuilt by filling stacks in
 * troop-list order from the pool; the partially wounded unit at the boundary
 * survives. Deterministic.
 */
function applyDamage(side: Side, damage: number, stats: CombatStats): void {
  if (damage <= 0) return
  if (damage >= side.troopHp) {
    side.hull -= damage - side.troopHp
    side.troopHp = 0
    side.troops = []
    return
  }
  side.troopHp -= damage
  let pool = side.troopHp
  side.troops = side.troops
    .map((t) => {
      const unitHp = stats.unit(t.unitId).health
      const take = Math.min(pool, t.count * unitHp)
      pool -= take
      return { unitId: t.unitId, count: Math.ceil(take / unitHp) }
    })
    .filter((t) => t.count > 0)
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
  onRoundEnd?: RoundEndHook,
): CombatResult {
  const attacker: Side = {
    combatant: input.attacker,
    troops: input.attacker.troops.map((t) => ({ ...t })),
    hull: effectiveShip(input.attacker, stats).hull,
    troopHp: troopHealth(input.attacker.troops, stats),
  }
  const defender: Side = {
    combatant: input.defender,
    troops: input.defender.troops.map((t) => ({ ...t })),
    hull: effectiveShip(input.defender, stats).hull,
    troopHp: troopHealth(input.defender.troops, stats),
  }

  const startAttacker = summarize(input.attacker, stats)
  const startDefender = summarize(input.defender, stats)

  const rounds: RoundReport[] = []
  let state = rng
  let round = 0
  let escapedId: string | null = null
  while (round < stats.combat.maxRounds && sideHp(attacker) > 0 && sideHp(defender) > 0) {
    round++
    const atkStrength = combatantStrength({ ...attacker.combatant, troops: attacker.troops }, stats)
    const defStrength = combatantStrength({ ...defender.combatant, troops: defender.troops }, stats)

    const tactics = chooseTactics({
      round,
      attackerStrength: atkStrength,
      defenderStrength: defStrength,
      attackerHp: sideHp(attacker),
      defenderHp: sideHp(defender),
    })

    let atkRoll: number
    let defRoll: number
    ;[state, atkRoll] = nextFloat(state)
    ;[state, defRoll] = nextFloat(state)

    const attackerDamage =
      atkStrength *
      (stats.combat.damageRollMin + atkRoll * stats.combat.damageRollSpread) *
      tactics.attackerModifier *
      stats.combat.damageScale
    const defenderDamage =
      defStrength *
      (stats.combat.damageRollMin + defRoll * stats.combat.damageRollSpread) *
      tactics.defenderModifier *
      stats.combat.damageScale

    applyDamage(defender, attackerDamage, stats)
    applyDamage(attacker, defenderDamage, stats)

    const attackerHpNow = sideHp(attacker)
    const defenderHpNow = sideHp(defender)
    rounds.push({
      round,
      attackerTactic: tactics.attackerTactic,
      defenderTactic: tactics.defenderTactic,
      attackerDamage: round4(attackerDamage),
      defenderDamage: round4(defenderDamage),
      attackerHp: round4(attackerHpNow),
      defenderHp: round4(defenderHpNow),
    })

    if (onRoundEnd && attackerHpNow > 0 && defenderHpNow > 0) {
      const signal = onRoundEnd({
        round,
        tactics,
        attackerHp: attackerHpNow,
        defenderHp: defenderHpNow,
        attackerTroops: attacker.troops.map((t) => ({ ...t })),
        defenderTroops: defender.troops.map((t) => ({ ...t })),
      })
      if (typeof signal === 'string') {
        escapedId = signal
        break
      }
      if (signal?.halt) break
    }
  }

  const attackerHp = sideHp(attacker)
  const defenderHp = sideHp(defender)
  const attackerSurvived = attackerHp > 0
  // On escape both sides survive and the side that held the field is the winner.
  // Otherwise the defender wins ties (attacker failed to break them).
  const attackerWins = escapedId
    ? escapedId === input.defender.ownerId
    : attackerSurvived && (defenderHp <= 0 || attackerHp > defenderHp)

  const report: BattleReport = {
    attacker: startAttacker,
    defender: startDefender,
    rounds,
    winnerId: attackerWins ? input.attacker.ownerId : input.defender.ownerId,
    loserId: attackerWins ? input.defender.ownerId : input.attacker.ownerId,
    attackerSurvived,
    defenderSurvived: defenderHp > 0,
    escapedId,
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
