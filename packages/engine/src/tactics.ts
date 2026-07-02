import {
  resolveRounds,
  type CombatInput,
  type CombatResult,
  type CombatStats,
  type Combatant,
  type RoundEndView,
  type RoundTactics,
  type RoundView,
} from './combat'
import type { RngState } from './rng'

/**
 * Hybrid tactical combat (#18) — the signature combat system.
 *
 * Each round both sides pick a tactic; a light rock-paper-scissors matrix layered
 * over raw strength shifts the odds without ever inverting them. Three drivers
 * feed the exact same resolver: an interactive human / preset plan
 * ({@link standingOrdersDriver}) and the AI ({@link aiTacticDriver}). Auto-resolve
 * is simply "AI drives both sides" ({@link resolveAutoTactical}).
 *
 * Balance guarantee (tested): tactic modifiers live in a narrow band, so the best
 * possible tactical edge (×MAX vs ×MIN) is smaller than a 3× strength gap — a
 * heavily outmatched fleet can never win on tactics alone.
 */

export type TacticId = 'broadside' | 'board' | 'ram' | 'evade'

export const TACTICS: readonly TacticId[] = ['broadside', 'board', 'ram', 'evade']

const TACTIC_ADVANTAGE = 1.25
const TACTIC_DISADVANTAGE = 0.8

/**
 * Damage multiplier for the row tactic when facing the column tactic. A 4-cycle:
 * broadside > ram > board > evade > broadside. Each tactic beats exactly one and
 * loses to exactly one; all other pairings are neutral (×1). Bounds are
 * [0.8, 1.25] so the widest tactical swing (1.25/0.8 ≈ 1.56×) cannot flip a 3× gap.
 */
export const TACTIC_MATRIX: Record<TacticId, Record<TacticId, number>> = {
  broadside: { broadside: 1, board: 1, ram: TACTIC_ADVANTAGE, evade: TACTIC_DISADVANTAGE },
  ram: { broadside: TACTIC_DISADVANTAGE, board: TACTIC_ADVANTAGE, ram: 1, evade: 1 },
  board: { broadside: 1, board: 1, ram: TACTIC_DISADVANTAGE, evade: TACTIC_ADVANTAGE },
  evade: { broadside: TACTIC_ADVANTAGE, board: TACTIC_DISADVANTAGE, ram: 1, evade: 1 },
}

/** Hull a ship needs before it can bring a ram to bear. */
const RAM_HULL_MIN = 50

/**
 * Which tactics a combatant may use. This is the seam where captain skills and
 * ship upgrades will gate advanced tactics (#18); today it keys off the starting
 * loadout: boarding needs crew, ramming needs a heavy enough hull.
 */
export function availableTactics(combatant: Combatant, stats: CombatStats): TacticId[] {
  const out: TacticId[] = ['broadside', 'evade']
  const hasCrew = combatant.troops.some((t) => t.count > 0)
  if (hasCrew) out.push('board')
  if (stats.ship(combatant.shipClassId).hull >= RAM_HULL_MIN) out.push('ram')
  return out
}

export interface TacticContext {
  round: number
  ownStrength: number
  enemyStrength: number
  ownHp: number
  enemyHp: number
  available: TacticId[]
}

export interface TacticDriver {
  choose(ctx: TacticContext): TacticId
}

/**
 * Standing orders: cycle a preset tactic plan, round by round. Powers both the
 * offline defender's saved orders and an interactive human's submitted plan. Any
 * order that isn't currently available falls back to broadside.
 */
export function standingOrdersDriver(orders: readonly TacticId[]): TacticDriver {
  return {
    choose(ctx) {
      if (orders.length === 0) return 'broadside'
      const pick = orders[(ctx.round - 1) % orders.length]!
      return ctx.available.includes(pick) ? pick : 'broadside'
    },
  }
}

/**
 * Utility AI driver. Deterministic: flee when clearly losing and able, close to
 * board when it holds a crew-strength edge, otherwise trade broadsides.
 */
export const aiTacticDriver: TacticDriver = {
  choose(ctx) {
    const losingBadly = ctx.ownHp < ctx.enemyHp * 0.5
    if (losingBadly && ctx.available.includes('evade')) return 'evade'
    if (ctx.ownStrength > ctx.enemyStrength * 1.15 && ctx.available.includes('board')) {
      return 'board'
    }
    if (ctx.available.includes('ram') && ctx.ownStrength >= ctx.enemyStrength) return 'ram'
    return 'broadside'
  },
}

export interface TacticalDrivers {
  attacker: TacticDriver
  defender: TacticDriver
}

/**
 * Resolve a battle with per-round tactics. Drives the shared round engine
 * (#12 {@link resolveRounds}) via a tactic-matrix chooser plus flee/escape rules:
 * a side that plays `evade`, survives the round, and is not being rammed breaks
 * off — both fleets survive and the side holding the field is the winner.
 */
export function resolveTacticalCombat(
  input: CombatInput,
  stats: CombatStats,
  rng: RngState,
  drivers: TacticalDrivers,
): CombatResult {
  const atkAvailable = availableTactics(input.attacker, stats)
  const defAvailable = availableTactics(input.defender, stats)

  const chooseTactics = (view: RoundView): RoundTactics => {
    const attackerTactic = drivers.attacker.choose({
      round: view.round,
      ownStrength: view.attackerStrength,
      enemyStrength: view.defenderStrength,
      ownHp: view.attackerHp,
      enemyHp: view.defenderHp,
      available: atkAvailable,
    })
    const defenderTactic = drivers.defender.choose({
      round: view.round,
      ownStrength: view.defenderStrength,
      enemyStrength: view.attackerStrength,
      ownHp: view.defenderHp,
      enemyHp: view.attackerHp,
      available: defAvailable,
    })
    return {
      attackerTactic,
      defenderTactic,
      attackerModifier: TACTIC_MATRIX[attackerTactic][defenderTactic],
      defenderModifier: TACTIC_MATRIX[defenderTactic][attackerTactic],
    }
  }

  const onRoundEnd = (view: RoundEndView): string | null => {
    const atk = view.tactics.attackerTactic as TacticId | null
    const def = view.tactics.defenderTactic as TacticId | null
    if (atk === 'evade' && def !== 'ram') return input.attacker.ownerId
    if (def === 'evade' && atk !== 'ram') return input.defender.ownerId
    return null
  }

  return resolveRounds(input, stats, rng, chooseTactics, onRoundEnd)
}

/** Auto-resolve with tactics: the AI drives both sides. Matches the plain resolver signature. */
export function resolveAutoTactical(
  input: CombatInput,
  stats: CombatStats,
  rng: RngState,
): CombatResult {
  return resolveTacticalCombat(input, stats, rng, {
    attacker: aiTacticDriver,
    defender: aiTacticDriver,
  })
}
