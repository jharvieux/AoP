import { boardAiDriver, resolveBoardBattle, type BoardDriver } from './battleBoard'
import {
  effectiveShip,
  resolveRounds,
  type CombatInput,
  type CombatResult,
  type CombatStats,
  type Combatant,
  type RoundEndSignal,
  type RoundEndView,
  type RoundTactics,
  type RoundView,
  type TacticsTuning,
} from './combat'
import { seedRng, type RngState } from './rng'

/**
 * Hybrid tactical combat (#18) — the signature combat system.
 *
 * Each round both sides pick a tactic; a light rock-paper-scissors matrix is
 * layered over raw strength and shifts odds without ever inverting them. Three
 * drivers feed the exact same resolver: an interactive human's recorded plan
 * ({@link tacticPlanDriver}), an offline defender's conditional standing orders
 * ({@link standingOrdersDriver}), and the AI ({@link aiTacticDriver}).
 * Auto-resolve is simply "the AI drives both sides"
 * ({@link resolveAutoTactical}) — identical math, always.
 *
 * Balance guarantee (tested): tactic modifiers live in a narrow band, so the
 * best possible tactical edge (×MAX vs ×MIN) stays well under a 3× strength
 * gap — a heavily outmatched fleet can never win on tactics alone.
 */

export type TacticId = 'broadside' | 'board' | 'ram' | 'evade'

export const TACTICS: readonly TacticId[] = ['broadside', 'board', 'ram', 'evade']

/** How a tactic fares against another: it wins, loses, or trades evenly. */
export type TacticOutcome = 'advantage' | 'neutral' | 'disadvantage'

/**
 * Which tactic beats which — the balance *identity*, a structural 4-cycle:
 * broadside > ram > board > evade > broadside. Each tactic beats exactly one and
 * loses to exactly one; every other pairing is neutral. The magnitudes of the
 * advantage/disadvantage are tuned balance data in @aop/content ({@link
 * TacticsTuning}) and applied by {@link tacticModifier}.
 *
 * Strategic identities (with the pin rules in {@link resolveTacticalCombat}):
 * - broadside: the gun line — safe default, shreds a charging rammer.
 * - board: grapple and storm — punishes an evader AND pins it in place, but
 *   leaves you alongside and exposed to a ram. Needs crew.
 * - ram: the brute charge — devastates a grappling boarder and pins runners,
 *   but eats a prepared broadside on the way in. Needs a heavy hull.
 * - evade: outsail the enemy — rakes a committed gun line and opens the door
 *   to escape, but a grapple or ram from a fast-enough chaser holds you fast.
 */
export const TACTIC_MATCHUPS: Record<TacticId, Record<TacticId, TacticOutcome>> = {
  broadside: { broadside: 'neutral', board: 'neutral', ram: 'advantage', evade: 'disadvantage' },
  ram: { broadside: 'disadvantage', board: 'advantage', ram: 'neutral', evade: 'neutral' },
  board: { broadside: 'neutral', board: 'neutral', ram: 'disadvantage', evade: 'advantage' },
  evade: { broadside: 'advantage', board: 'disadvantage', ram: 'neutral', evade: 'neutral' },
}

/** The tuned damage multiplier for a matchup outcome. */
export function tacticModifier(outcome: TacticOutcome, tactics: TacticsTuning): number {
  switch (outcome) {
    case 'advantage':
      return tactics.advantage
    case 'disadvantage':
      return tactics.disadvantage
    case 'neutral':
      return 1
  }
}

/** Close-quarters tactics that hold an evader in the fight (see the pin rule). */
const PINNING_TACTICS: readonly TacticId[] = ['board', 'ram']

/**
 * Which tactics a combatant may use. This is the seam where captain skills and
 * ship upgrades will gate advanced tactics (#18); today it keys off the
 * loadout: boarding needs crew, ramming needs a heavy enough hull.
 */
export function availableTactics(combatant: Combatant, stats: CombatStats): TacticId[] {
  const out: TacticId[] = ['broadside', 'evade']
  const hasCrew = combatant.troops.some((t) => t.count > 0)
  if (hasCrew) out.push('board')
  if (effectiveShip(combatant, stats).hull >= stats.tactics.ramHullMin) out.push('ram')
  return out
}

/**
 * Everything a driver may know when picking a tactic. Deliberately symmetric —
 * both sides get the same shape, and nothing here is hidden information: ship
 * classes (speeds), fleet strengths, and hit points are all revealed by the
 * engagement itself, and `enemyLastTactic` is the *previous* round's pick,
 * already in the battle log. No driver ever sees the enemy's current-round
 * choice (picks are simultaneous), which keeps every driver — human, AI, or
 * standing orders — honest under the D-009 anti-cheat model.
 */
export interface TacticContext {
  round: number
  ownStrength: number
  enemyStrength: number
  ownHp: number
  enemyHp: number
  ownSpeed: number
  enemySpeed: number
  enemyLastTactic: TacticId | null
  available: TacticId[]
}

export interface TacticDriver {
  choose(ctx: TacticContext): TacticId
}

/** Conditions a standing order may key on. All derive from {@link TacticContext}. */
export type OrderCondition = 'always' | 'outgunned' | 'winning' | 'losing' | 'enemyEvaded'

export const ORDER_CONDITIONS: readonly OrderCondition[] = [
  'always',
  'outgunned',
  'winning',
  'losing',
  'enemyEvaded',
]

/** One rule of a standing-orders plan: "when <condition>, do <tactic>". */
export interface StandingOrder {
  when: OrderCondition
  tactic: TacticId
}

function conditionHolds(when: OrderCondition, ctx: TacticContext, outgunnedRatio: number): boolean {
  switch (when) {
    case 'always':
      return true
    case 'outgunned':
      return ctx.enemyStrength >= ctx.ownStrength * outgunnedRatio
    case 'winning':
      return ctx.ownHp > ctx.enemyHp
    case 'losing':
      return ctx.ownHp < ctx.enemyHp
    case 'enemyEvaded':
      return ctx.enemyLastTactic === 'evade'
  }
}

/**
 * Standing orders: conditional rules, first match wins. This is the Phase 3
 * offline-defence driver — expressive enough for real strategy, e.g. the D-002
 * canonical plan "evade if outgunned, else broadside":
 *
 *   [{ when: 'outgunned', tactic: 'evade' }, { when: 'always', tactic: 'broadside' }]
 *
 * Rules whose tactic isn't currently available are skipped; if nothing matches
 * the fleet falls back to broadside (always available). `outgunnedRatio` is the
 * tuned threshold the 'outgunned' condition keys on (balance data, @aop/content).
 */
export function standingOrdersDriver(
  orders: readonly StandingOrder[],
  outgunnedRatio: number,
): TacticDriver {
  return {
    choose(ctx) {
      for (const order of orders) {
        if (
          ctx.available.includes(order.tactic) &&
          conditionHolds(order.when, ctx, outgunnedRatio)
        ) {
          return order.tactic
        }
      }
      return 'broadside'
    },
  }
}

/**
 * A fixed tactic sequence, cycling round by round. Carries an interactive
 * player's recorded per-round picks through the action log (so replays are
 * exact), or a hand-written pattern like [board, ram]. Any pick that isn't
 * currently available falls back to broadside.
 */
export function tacticPlanDriver(plan: readonly TacticId[]): TacticDriver {
  return {
    choose(ctx) {
      if (plan.length === 0) return 'broadside'
      const pick = plan[(ctx.round - 1) % plan.length]!
      return ctx.available.includes(pick) ? pick : 'broadside'
    },
  }
}

/**
 * Utility AI driver. Deterministic: run when clearly losing (but ram a chaser
 * who has us grappled — evading a held ship is a doomed play), pin a fleeing
 * enemy when fast enough to hold it, board when holding a crew-strength edge,
 * otherwise trade broadsides.
 *
 * The losing/boarding thresholds are balance data (`aiLosingHpRatio`,
 * `aiBoardStrengthRatio` in {@link TacticsTuning}, #212) injected from
 * @aop/content rather than hardcoded here. The driver is cached per tuning
 * object (frozen once into a match's config, so it's stable for the match's
 * lifetime) so repeated calls with the same tuning return the identical
 * instance — the client's naval-AI mirror in `boardingPlanner.ts` relies on
 * this to prove parity with the reducer's driver selection.
 */
const aiTacticDriverCache = new WeakMap<TacticsTuning, TacticDriver>()
export function aiTacticDriver(tactics: TacticsTuning): TacticDriver {
  let driver = aiTacticDriverCache.get(tactics)
  if (!driver) {
    driver = {
      choose(ctx) {
        const losingBadly = ctx.ownHp < ctx.enemyHp * tactics.aiLosingHpRatio
        if (losingBadly && ctx.available.includes('evade')) {
          const enemyCanPin = ctx.enemySpeed >= ctx.ownSpeed
          if (enemyCanPin && ctx.enemyLastTactic === 'board' && ctx.available.includes('ram')) {
            return 'ram'
          }
          return 'evade'
        }
        if (ctx.enemyLastTactic === 'evade' && ctx.ownSpeed >= ctx.enemySpeed) {
          if (ctx.available.includes('board')) return 'board'
          if (ctx.available.includes('ram')) return 'ram'
        }
        if (
          ctx.ownStrength > ctx.enemyStrength * tactics.aiBoardStrengthRatio &&
          ctx.available.includes('board')
        ) {
          return 'board'
        }
        if (ctx.available.includes('ram') && ctx.ownStrength >= ctx.enemyStrength) return 'ram'
        return 'broadside'
      },
    }
    aiTacticDriverCache.set(tactics, driver)
  }
  return driver
}

/**
 * Aggressive combat AI (#25): press the attack. Pin a fleeing enemy, otherwise
 * force close-quarters (board, then ram) to end the fight fast; only break off
 * when nearly sunk. Suits the `aggressive` personality. The break-off threshold
 * is `aggressiveEvadeHpRatio` in {@link TacticsTuning} (#212); see
 * {@link aiTacticDriver} for the caching rationale.
 */
const aggressiveTacticDriverCache = new WeakMap<TacticsTuning, TacticDriver>()
export function aggressiveTacticDriver(tactics: TacticsTuning): TacticDriver {
  let driver = aggressiveTacticDriverCache.get(tactics)
  if (!driver) {
    driver = {
      choose(ctx) {
        if (
          ctx.ownHp < ctx.enemyHp * tactics.aggressiveEvadeHpRatio &&
          ctx.available.includes('evade')
        ) {
          return 'evade'
        }
        if (ctx.enemyLastTactic === 'evade' && ctx.ownSpeed >= ctx.enemySpeed) {
          if (ctx.available.includes('board')) return 'board'
          if (ctx.available.includes('ram')) return 'ram'
        }
        if (ctx.available.includes('board')) return 'board'
        if (ctx.available.includes('ram')) return 'ram'
        return 'broadside'
      },
    }
    aggressiveTacticDriverCache.set(tactics, driver)
  }
  return driver
}

/**
 * Cautious combat AI (#25): preserve the fleet. Break off the moment the fight
 * turns against you (ramming a chaser who has grappled you, since evading a held
 * ship is doomed), and only commit to boarding from a commanding lead. Suits the
 * `economic` personality, which would rather keep its ships than trade them. The
 * boarding threshold is `cautiousBoardStrengthRatio` in {@link TacticsTuning}
 * (#212); see {@link aiTacticDriver} for the caching rationale.
 */
const cautiousTacticDriverCache = new WeakMap<TacticsTuning, TacticDriver>()
export function cautiousTacticDriver(tactics: TacticsTuning): TacticDriver {
  let driver = cautiousTacticDriverCache.get(tactics)
  if (!driver) {
    driver = {
      choose(ctx) {
        if (ctx.ownHp < ctx.enemyHp && ctx.available.includes('evade')) {
          const enemyCanPin = ctx.enemySpeed >= ctx.ownSpeed
          if (enemyCanPin && ctx.enemyLastTactic === 'board' && ctx.available.includes('ram')) {
            return 'ram'
          }
          return 'evade'
        }
        if (
          ctx.ownStrength > ctx.enemyStrength * tactics.cautiousBoardStrengthRatio &&
          ctx.available.includes('board')
        ) {
          return 'board'
        }
        return 'broadside'
      },
    }
    cautiousTacticDriverCache.set(tactics, driver)
  }
  return driver
}

/**
 * Unskilled combat AI (#25): hold the gun line and never adapt. Deliberately
 * weaker than {@link aiTacticDriver} — the tactical play of an `easy` opponent.
 */
export const plainTacticDriver: TacticDriver = {
  choose(ctx) {
    return ctx.available.includes('broadside') ? 'broadside' : (ctx.available[0] ?? 'broadside')
  },
}

export interface TacticalDrivers {
  attacker: TacticDriver
  defender: TacticDriver
  /**
   * Who fights each side's crews when a boarding action sends the battle to
   * the hex board (#39). Defaults to the normal board AI — auto-resolve. An
   * interactive attacker passes a recorded-command plan driver; an offline
   * defender's standing board orders are wired in by the reducer.
   */
  attackerBoard?: BoardDriver
  defenderBoard?: BoardDriver
}

/**
 * Resolve a battle with per-round tactics. Drives the shared round engine
 * (#12 {@link resolveRounds}) via a tactic-matrix chooser plus the flee/escape
 * rules: a side that plays `evade` and survives the round breaks off — both
 * fleets survive and the side holding the field is the winner — unless the
 * enemy **pins** it. A pin is a close-quarters tactic (board or ram) from a
 * ship at least as fast as the runner: light ships outsail heavy pursuers, so
 * catching a sloop takes a sloop, while a fleeing heavy must dodge grapples.
 * The chase is a mind game — committing to a pin means eating a punish if the
 * "runner" turns and fights.
 *
 * **Boarding (#39)**: when the match's stats snapshot carries battle-board
 * tuning, a `board` tactic that lands — the boarder still has crew, the enemy
 * neither escaped nor repelled the grapple with `ram` (the matrix identity:
 * ram beats board) — ends the gunnery duel and sends both crews to the hex
 * battle board. The melee decides the whole battle: the loser's ship is lost
 * with all hands, the winner keeps its board survivors. Pre-#39 snapshots
 * have no battle tuning, so old saves and logs replay unchanged.
 */
export function resolveTacticalCombat(
  input: CombatInput,
  stats: CombatStats,
  rng: RngState,
  drivers: TacticalDrivers,
): CombatResult {
  const atkAvailable = availableTactics(input.attacker, stats)
  const defAvailable = availableTactics(input.defender, stats)
  const atkSpeed = effectiveShip(input.attacker, stats).speed
  const defSpeed = effectiveShip(input.defender, stats).speed

  let lastAttackerTactic: TacticId | null = null
  let lastDefenderTactic: TacticId | null = null

  const chooseTactics = (view: RoundView): RoundTactics => {
    const attackerTactic = drivers.attacker.choose({
      round: view.round,
      ownStrength: view.attackerStrength,
      enemyStrength: view.defenderStrength,
      ownHp: view.attackerHp,
      enemyHp: view.defenderHp,
      ownSpeed: atkSpeed,
      enemySpeed: defSpeed,
      enemyLastTactic: lastDefenderTactic,
      available: atkAvailable,
    })
    const defenderTactic = drivers.defender.choose({
      round: view.round,
      ownStrength: view.defenderStrength,
      enemyStrength: view.attackerStrength,
      ownHp: view.defenderHp,
      enemyHp: view.attackerHp,
      ownSpeed: defSpeed,
      enemySpeed: atkSpeed,
      enemyLastTactic: lastAttackerTactic,
      available: defAvailable,
    })
    lastAttackerTactic = attackerTactic
    lastDefenderTactic = defenderTactic
    return {
      attackerTactic,
      defenderTactic,
      attackerModifier: tacticModifier(
        TACTIC_MATCHUPS[attackerTactic][defenderTactic],
        stats.tactics,
      ),
      defenderModifier: tacticModifier(
        TACTIC_MATCHUPS[defenderTactic][attackerTactic],
        stats.tactics,
      ),
    }
  }

  const pinned = (chaserTactic: TacticId | null, chaserSpeed: number, runnerSpeed: number) =>
    chaserTactic !== null && PINNING_TACTICS.includes(chaserTactic) && chaserSpeed >= runnerSpeed

  let boarded = false
  const onRoundEnd = (view: RoundEndView): RoundEndSignal => {
    const atk = view.tactics.attackerTactic as TacticId | null
    const def = view.tactics.defenderTactic as TacticId | null
    // Attacker checked first: the attacker initiated, so if both sides disengage
    // the attacker is the one who broke off and the defender holds the field.
    if (atk === 'evade' && !pinned(def, defSpeed, atkSpeed)) return input.attacker.ownerId
    if (def === 'evade' && !pinned(atk, atkSpeed, defSpeed)) return input.defender.ownerId

    // Boarding (#39): a landed grapple halts the gunnery and starts the melee.
    // `ram` repels a grapple (the matrix identity), and a crew wiped out by the
    // round's broadsides has no one left to swing across.
    if (stats.battle) {
      const atkBoards =
        atk === 'board' && def !== 'ram' && view.attackerTroops.some((t) => t.count > 0)
      const defBoards =
        def === 'board' && atk !== 'ram' && view.defenderTroops.some((t) => t.count > 0)
      if (atkBoards || defBoards) {
        boarded = true
        return { halt: true }
      }
    }
    return null
  }

  const result = resolveRounds(input, stats, rng, chooseTactics, onRoundEnd)
  if (!boarded) return result

  // The melee decides everything. Crews fight with their post-gunnery numbers;
  // the loser's ship strikes its colors and is lost with all hands.
  const melee = resolveBoardBattle(
    {
      attacker: { ...input.attacker, troops: result.attackerTroops },
      defender: { ...input.defender, troops: result.defenderTroops },
    },
    stats,
    result.rng,
    {
      attacker: drivers.attackerBoard ?? boardAiDriver('normal'),
      defender: drivers.defenderBoard ?? boardAiDriver('normal'),
    },
    'boarding',
  )

  const attackerWon = melee.winnerSide === 'attacker'
  const attackerTroops = attackerWon ? melee.attackerTroops : []
  const defenderTroops = attackerWon ? [] : melee.defenderTroops
  return {
    report: {
      ...result.report,
      winnerId: attackerWon ? input.attacker.ownerId : input.defender.ownerId,
      loserId: attackerWon ? input.defender.ownerId : input.attacker.ownerId,
      attackerSurvived: attackerWon,
      defenderSurvived: !attackerWon,
      escapedId: null,
      survivingTroops: { attacker: attackerTroops, defender: defenderTroops },
      board: melee.log,
    },
    rng: melee.rng,
    attackerTroops,
    defenderTroops,
  }
}

/** Auto-resolve with tactics: the AI drives both sides. Matches the plain resolver signature. */
export function resolveAutoTactical(
  input: CombatInput,
  stats: CombatStats,
  rng: RngState,
): CombatResult {
  const driver = aiTacticDriver(stats.tactics)
  return resolveTacticalCombat(input, stats, rng, {
    attacker: driver,
    defender: driver,
  })
}

/** Win-probability estimate for a would-be engagement — powers the pre-attack odds preview (#19). */
export interface CombatOdds {
  attackerWinProbability: number
  defenderWinProbability: number
  /** Fraction of trials that ended with a side breaking off (flee/escape, #18). */
  escapeProbability: number
  trials: number
}

/**
 * Monte-Carlo odds estimate: runs `trials` auto-resolved tactical battles through
 * the real resolver ({@link resolveAutoTactical}) with a scratch RNG seeded from
 * `scratchSeed`, so it never touches GameState.rngState. Pure and deterministic
 * in its arguments — the client passes its own seed (e.g. actionCount) so the same
 * preview is reproducible. The attacker uses the given tactic plan when one is
 * supplied; otherwise both sides are AI-driven, matching an unplanned attack.
 */
export function estimateOdds(
  input: CombatInput,
  stats: CombatStats,
  scratchSeed: number,
  trials = 200,
  attackerPlan?: readonly TacticId[],
): CombatOdds {
  const drivers: TacticalDrivers = {
    attacker: attackerPlan?.length ? tacticPlanDriver(attackerPlan) : aiTacticDriver(stats.tactics),
    defender: aiTacticDriver(stats.tactics),
  }
  let attackerWins = 0
  let defenderWins = 0
  let escapes = 0
  for (let i = 0; i < trials; i++) {
    const { report } = resolveTacticalCombat(input, stats, seedRng(scratchSeed + i), drivers)
    if (report.escapedId) escapes += 1
    if (report.winnerId === input.attacker.ownerId) attackerWins += 1
    else defenderWins += 1
  }
  return {
    attackerWinProbability: attackerWins / trials,
    defenderWinProbability: defenderWins / trials,
    escapeProbability: escapes / trials,
    trials,
  }
}
