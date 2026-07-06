import {
  boardOrdersDriver,
  type BoardActivationView,
  type BoardCommand,
  type BoardDriver,
} from './battleBoard'
import { createCombatStats, type BattleReport } from './combat'
import { aiTacticDriverForOwner, captainToCombatant } from './reducer'
import { resolveTacticalCombat, standingOrdersDriver, tacticPlanDriver } from './tactics'
import type { AttackCaptainAction } from './actions'
import type { GameState } from './types'

/**
 * Interactive boarding-melee probe (#93, and #285's multiplayer analog). The
 * engine's board resolver is a pure synchronous function that pulls one
 * command per activation from a driver, so an interactive client can't feed
 * it taps directly. Instead, the caller *probes*: it re-runs the whole battle
 * from the given `GameState`'s RNG with the player's recorded commands so
 * far, and a recording driver that aborts the simulation (via a sentinel
 * throw) at the first attacker activation that has no command yet, handing
 * back the engine's own {@link BoardActivationView} — reachable hexes,
 * attackable targets, full board state. The battle is deterministic, so
 * every probe replays the same prefix bit-exactly; the board is tiny (11×8,
 * ≤14 stacks), so a full re-run per confirmed order costs well under a
 * millisecond.
 *
 * When the probe resolves instead of awaiting, the recorded commands are
 * submitted as `AttackCaptainAction.boardCommands` and the reducer re-derives
 * the identical fight from the action log — the replay/authority contract.
 * A command that would be illegal at execution degrades to hold inside the
 * engine (never a desync), and a plan the reducer can't follow is abandoned
 * to the board AI; either way the battle still resolves.
 *
 * Single-player (`apps/web/src/screens/GameScreen.tsx`, via
 * `apps/web/src/boardingPlanner.ts`) probes a live client-held `GameState`
 * directly. Multiplayer has no client-held `GameState` by design
 * (docs/MULTIPLAYER.md §7 — `rngState` never leaves the server), so
 * `supabase/functions/_shared/match.ts`'s `probeBoarding` calls this same
 * function against the server-reconstructed authoritative state, gated by
 * {@link assertAttackLegal} so an illegal attack never gets a free look at a
 * battle it was never entitled to start.
 */
export type BoardingProbeOutcome =
  | { kind: 'resolved'; report: BattleReport }
  | { kind: 'awaitingCommand'; view: BoardActivationView }

/** Sentinel thrown by the recording driver to halt the probe at the next un-commanded activation. */
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
    return { kind: 'resolved', report: result.report }
  } catch (err) {
    if (err instanceof AwaitingCommand) return { kind: 'awaitingCommand', view: err.view }
    throw err
  }
}
