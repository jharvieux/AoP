import type { AttackCaptainAction, AttackCityAction } from './actions'
import {
  boardOrdersDriver,
  resolveBoardCombat,
  type BoardActivationView,
  type BoardCommand,
  type BoardDriver,
} from './battleBoard'
import { createCombatStats, type BattleReport } from './combat'
import {
  aiTacticDriverForOwner,
  captainToCombatant,
  cityToCombatant,
  prizeSpawnFor,
} from './reducer'
import {
  resolveTacticalCombat,
  standingOrdersDriver,
  tacticPlanDriver,
  type TacticContext,
  type TacticDriver,
  type TacticId,
} from './tactics'
import type { GameState } from './types'

/**
 * Interactive-combat probes (#93, #305, #344). The engine's battle resolvers
 * are pure synchronous functions that pull one order per activation from a
 * driver, so an interactive UI can't feed them taps directly. Instead the
 * caller *probes*: it re-runs the whole battle from the current GameState RNG
 * with the orders recorded so far, and a recording driver that aborts the
 * simulation (via a sentinel throw) at the first undecided round/activation,
 * handing back the engine's own decision context. The battle is deterministic,
 * so every probe replays the same prefix bit-exactly; the board is tiny (11×8,
 * ≤14 stacks), so a full re-run per confirmed order costs well under a
 * millisecond.
 *
 * These helpers live in the engine (not the web app) because both surfaces run
 * them: single-player's client probes the live GameState it already holds, and
 * multiplayer's server probes the authoritative state per round without ever
 * shipping `rngState` to the client (docs/design/multiplayer-tactical-probe.md).
 * They are pure engine-only code — no DOM, no I/O — operating on a GameState
 * and its seeded RNG exactly as the reducer does.
 *
 * When a probe resolves instead of awaiting, the recorded orders are submitted
 * as `AttackCaptainAction.attackerOrders`/`boardCommands` (or
 * `AttackCityAction.boardCommands`) and the reducer re-derives the identical
 * fight from the action log — the replay/authority contract. An order that
 * would be illegal at execution degrades inside the engine (never a desync),
 * and a plan the reducer can't follow is abandoned to the combat AI; either
 * way the battle still resolves.
 */

export type BoardingProbeOutcome =
  | { kind: 'resolved'; report: BattleReport }
  | { kind: 'awaitingCommand'; view: BoardActivationView }

/** Sentinel thrown by the recording board driver to halt the probe at the next un-commanded activation. */
class AwaitingCommand {
  constructor(readonly view: BoardActivationView) {}
}

/**
 * Re-simulate the pending attack with the player's recorded board commands.
 * Returns the next activation awaiting a command, or the final report once
 * the battle resolves (including battles that never reach a boarding melee).
 * Mirrors the combat invocation in the reducer's `attackCaptain` handler.
 */
export function probeBoardingBattle(
  game: GameState,
  action: Pick<AttackCaptainAction, 'captainId' | 'targetCaptainId' | 'attackerOrders'>,
  commands: readonly BoardCommand[],
): BoardingProbeOutcome {
  const attacker = game.captains.find((c) => c.id === action.captainId)
  const target = game.captains.find((c) => c.id === action.targetCaptainId)
  if (!attacker || !target) throw new Error('Attacker or target captain not found')
  if (!game.config.combatStats) throw new Error('No combat stats configured for this match')

  const stats = createCombatStats(game.config.combatStats)
  const content = game.config.content

  let cursor = 0
  const recorder: BoardDriver = {
    choose(view) {
      if (cursor < commands.length) return commands[cursor++]!
      throw new AwaitingCommand(view)
    },
  }

  try {
    const result = resolveTacticalCombat(
      {
        attacker: captainToCombatant(attacker, content),
        defender: captainToCombatant(target, content),
      },
      stats,
      game.rngState,
      {
        attacker: action.attackerOrders?.length
          ? tacticPlanDriver(action.attackerOrders)
          : aiTacticDriverForOwner(game, attacker.ownerId, stats.tactics),
        defender: target.standingOrders?.length
          ? standingOrdersDriver(target.standingOrders, stats.tactics.outgunnedRatio)
          : aiTacticDriverForOwner(game, target.ownerId, stats.tactics),
        attackerBoard: recorder,
        ...(target.boardOrders?.length
          ? { defenderBoard: boardOrdersDriver(target.boardOrders) }
          : {}),
      },
    )
    return { kind: 'resolved', report: withPrizeShip(result.report, game, attacker, target) }
  } catch (err) {
    if (err instanceof AwaitingCommand) return { kind: 'awaitingCommand', view: err.view }
    throw err
  }
}

/**
 * Attach the #374 prize-ship metadata a decisive naval victory produces, using
 * the engine's shared helper so the previewed report matches the reducer's byte
 * for byte. A non-decisive result (escape/draw) returns the report unchanged.
 */
function withPrizeShip(
  report: BattleReport,
  game: GameState,
  attacker: Parameters<typeof prizeSpawnFor>[1],
  defender: Parameters<typeof prizeSpawnFor>[2],
): BattleReport {
  const prize = prizeSpawnFor(report, attacker, defender, game.actionCount, game.config.setup)
  return prize ? { ...report, prizeShip: prize.report } : report
}

/**
 * Interactive city-assault planner (#344). The land analog of
 * {@link probeBoardingBattle}: re-simulates the pending `attackCity` from the
 * current GameState RNG with the player's recorded land-melee commands so far,
 * pausing at the first un-commanded attacker activation to hand the UI the
 * board view. Mirrors the reducer's `attackCity` board invocation exactly —
 * the attacker's embarked troops vs the city's garrison on the `'land'` board,
 * the garrison always driven by the board AI — so the recorded commands replay
 * bit-for-bit when submitted as `AttackCityAction.boardCommands`.
 */
export function probeCityAssault(
  game: GameState,
  action: Pick<AttackCityAction, 'captainId' | 'targetCityId'>,
  commands: readonly BoardCommand[],
): BoardingProbeOutcome {
  const attacker = game.captains.find((c) => c.id === action.captainId)
  const city = game.cities.find((c) => c.id === action.targetCityId)
  if (!attacker || !city) throw new Error('Attacker or target city not found')
  if (!game.config.combatStats?.battle) {
    throw new Error('No board tuning configured for a city assault')
  }

  const stats = createCombatStats(game.config.combatStats)
  const content = game.config.content

  let cursor = 0
  const recorder: BoardDriver = {
    choose(view) {
      if (cursor < commands.length) return commands[cursor++]!
      throw new AwaitingCommand(view)
    },
  }

  try {
    const result = resolveBoardCombat(
      {
        attacker: captainToCombatant(attacker, content),
        defender: cityToCombatant(city, content),
      },
      stats,
      game.rngState,
      { attacker: recorder },
      'land',
    )
    return { kind: 'resolved', report: result.report }
  } catch (err) {
    if (err instanceof AwaitingCommand) return { kind: 'awaitingCommand', view: err.view }
    throw err
  }
}

/**
 * Interactive naval-tactics planner (#305). Extends the boarding probe one
 * phase earlier, to the gunnery rounds themselves: same probe-and-record
 * contract as {@link probeBoardingBattle}, but the attacker's per-round
 * tactic is what's recorded (`AttackCaptainAction.attackerOrders`) instead of
 * (or in addition to) the boarding commands. Every round the player has
 * already committed replays instantly; the first round without one throws
 * the {@link AwaitingTactic} sentinel with the engine's own {@link
 * TacticContext} — strength, HP, speed, the enemy's last pick — so the UI can
 * render the decision and nothing else. If gunnery alone decides the battle,
 * or a boarding melee starts, the caller gets a resolved report or the
 * existing {@link BoardingProbeOutcome}'s `awaitingCommand` view respectively
 * — the melee UI keeps working unchanged.
 *
 * `tacticOrders.length` only ever grows to exactly the number of rounds the
 * battle actually fights (the sentinel guarantees every fought round has a
 * recorded pick before the probe resolves), so `tacticPlanDriver`'s cyclic
 * fallback — the reducer's replay driver — is never exercised on the wrap:
 * probe and reducer agree round for round.
 */
export type TacticalProbeOutcome =
  | { kind: 'resolved'; report: BattleReport }
  | { kind: 'awaitingTactic'; ctx: TacticContext }
  | { kind: 'awaitingCommand'; view: BoardActivationView }

/** Sentinel thrown by the recording tactic driver to halt the probe at the next undecided round. */
class AwaitingTactic {
  constructor(readonly ctx: TacticContext) {}
}

function recordingTacticDriver(commands: readonly TacticId[]): TacticDriver {
  return {
    choose(ctx) {
      if (ctx.round - 1 < commands.length) {
        const pick = commands[ctx.round - 1]!
        return ctx.available.includes(pick) ? pick : 'broadside'
      }
      throw new AwaitingTactic(ctx)
    },
  }
}

export function probeTacticalBattle(
  game: GameState,
  action: Pick<AttackCaptainAction, 'captainId' | 'targetCaptainId'>,
  tacticOrders: readonly TacticId[],
  boardCommands: readonly BoardCommand[],
): TacticalProbeOutcome {
  const attacker = game.captains.find((c) => c.id === action.captainId)
  const target = game.captains.find((c) => c.id === action.targetCaptainId)
  if (!attacker || !target) throw new Error('Attacker or target captain not found')
  if (!game.config.combatStats) throw new Error('No combat stats configured for this match')

  const stats = createCombatStats(game.config.combatStats)
  const content = game.config.content

  let cursor = 0
  const boardRecorder: BoardDriver = {
    choose(view) {
      if (cursor < boardCommands.length) return boardCommands[cursor++]!
      throw new AwaitingCommand(view)
    },
  }

  try {
    const result = resolveTacticalCombat(
      {
        attacker: captainToCombatant(attacker, content),
        defender: captainToCombatant(target, content),
      },
      stats,
      game.rngState,
      {
        attacker: recordingTacticDriver(tacticOrders),
        defender: target.standingOrders?.length
          ? standingOrdersDriver(target.standingOrders, stats.tactics.outgunnedRatio)
          : aiTacticDriverForOwner(game, target.ownerId, stats.tactics),
        attackerBoard: boardRecorder,
        ...(target.boardOrders?.length
          ? { defenderBoard: boardOrdersDriver(target.boardOrders) }
          : {}),
      },
    )
    return { kind: 'resolved', report: withPrizeShip(result.report, game, attacker, target) }
  } catch (err) {
    if (err instanceof AwaitingTactic) return { kind: 'awaitingTactic', ctx: err.ctx }
    if (err instanceof AwaitingCommand) return { kind: 'awaitingCommand', view: err.view }
    throw err
  }
}
