import {
  aggressiveTacticDriver,
  aiTacticDriver,
  boardOrdersDriver,
  captainToCombatant,
  cautiousTacticDriver,
  cityToCombatant,
  createCombatStats,
  hexDistance,
  hexEquals,
  hexIndex,
  hexLineOfSight,
  plainTacticDriver,
  prizeSpawnFor,
  resolveBoardCombat,
  resolveTacticalCombat,
  standingOrdersDriver,
  tacticPlanDriver,
  type AttackCaptainAction,
  type AttackCityAction,
  type BattleReport,
  type BoardActivationView,
  type BoardCommand,
  type BoardDriver,
  type BoardStack,
  type BoardTerrain,
  type GameState,
  type HexCoord,
  type TacticContext,
  type TacticDriver,
  type TacticId,
  type TacticsTuning,
} from '@aop/engine'

/**
 * Interactive boarding-melee planner (#93). The engine's board resolver is a
 * pure synchronous function that pulls one command per activation from a
 * driver, so an interactive client can't feed it taps directly. Instead, the
 * client *probes*: it re-runs the whole battle from the current GameState RNG
 * with the player's recorded commands so far, and a recording driver that
 * aborts the simulation (via a sentinel throw) at the first attacker
 * activation that has no command yet, handing the UI the engine's own
 * {@link BoardActivationView} — reachable hexes, attackable targets, full
 * board state. The battle is deterministic, so every probe replays the same
 * prefix bit-exactly; the board is tiny (11×8, ≤14 stacks), so a full re-run
 * per confirmed order costs well under a millisecond.
 *
 * When the probe resolves instead of awaiting, the recorded commands are
 * submitted as `AttackCaptainAction.boardCommands` and the reducer re-derives
 * the identical fight from the action log — the replay/authority contract.
 * A command that would be illegal at execution degrades to hold inside the
 * engine (never a desync), and a plan the reducer can't follow is abandoned
 * to the board AI; either way the battle still resolves.
 */

export type BoardingProbeOutcome =
  | { kind: 'resolved'; report: BattleReport }
  | { kind: 'awaitingCommand'; view: BoardActivationView }

/** Sentinel thrown by the recording driver to halt the probe at the next un-commanded activation. */
class AwaitingCommand {
  constructor(readonly view: BoardActivationView) {}
}

/**
 * Naval-phase AI for one seat. MUST mirror `aiTacticDriverForOwner` in the
 * engine's reducer.ts exactly — the probe has to replay the same naval rounds
 * the reducer will, or the recorded melee plan desyncs (and degrades to the
 * board AI). The parity test in boardingPlanner.test.ts is the tripwire;
 * this is exported only so that test can compare the two directly.
 */
export function navalAiDriverFor(
  game: GameState,
  ownerId: string,
  tactics: TacticsTuning,
): TacticDriver {
  const profile = game.players.find((p) => p.id === ownerId)?.aiProfile
  if (!profile) return aiTacticDriver(tactics)
  if (profile.difficulty === 'easy') return plainTacticDriver
  if (profile.personality === 'aggressive') return aggressiveTacticDriver(tactics)
  if (profile.personality === 'economic') return cautiousTacticDriver(tactics)
  return aiTacticDriver(tactics)
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
          : navalAiDriverFor(game, attacker.ownerId, stats.tactics),
        defender: target.standingOrders?.length
          ? standingOrdersDriver(target.standingOrders, stats.tactics.outgunnedRatio)
          : navalAiDriverFor(game, target.ownerId, stats.tactics),
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
          : navalAiDriverFor(game, target.ownerId, stats.tactics),
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

export interface MovePlan {
  command: BoardCommand
  cost: number
  terrain: BoardTerrain
}

/** A move order for the acting stack, or null when the hex isn't reachable this activation. */
export function planMove(view: BoardActivationView, hex: HexCoord): MovePlan | null {
  const reachable = view.reachable.find((r) => hexEquals(r.hex, hex))
  if (!reachable) return null
  return {
    command: { stackId: view.stack.id, to: { col: hex.col, row: hex.row } },
    cost: reachable.cost,
    terrain: view.terrain[hexIndex(hex, view.width)]!,
  }
}

export interface AttackPlan {
  command: BoardCommand
  mode: 'melee' | 'ranged'
  /** Hex the stack strikes from; null = it fights from where it stands. */
  from: HexCoord | null
  /** A second friendly stack is on the target's flank — the flanking bonus applies. */
  flanking: boolean
  /** The target can strike back this round (melee only, once per round). */
  retaliation: boolean
}

/**
 * An attack order against `targetId`, built strictly from the engine's own
 * activation view so it is legal by construction. With `moveTo`, the player
 * has picked the hex to strike from; without it, the engine's best option is
 * used (a clear shot for ranged stacks, else the cheapest adjacent hex).
 * Null when the target can't be engaged this activation.
 */
export function planAttack(
  view: BoardActivationView,
  targetId: number,
  moveTo?: HexCoord,
): AttackPlan | null {
  const enemy = view.enemies.find((e) => e.id === targetId)
  const option = view.targets.find((t) => t.targetId === targetId)
  if (!enemy || !option) return null

  const build = (from: HexCoord | null, mode: 'melee' | 'ranged'): AttackPlan => ({
    command: {
      stackId: view.stack.id,
      ...(from ? { to: { col: from.col, row: from.row } } : {}),
      targetId,
    },
    mode,
    from,
    flanking:
      mode === 'melee' && view.allies.some((a) => hexDistance(a.position, enemy.position) === 1),
    retaliation: mode === 'melee' && enemy.retaliatedRound < view.round,
  })

  if (moveTo) {
    if (!view.reachable.some((r) => hexEquals(r.hex, moveTo))) return null
    const distance = hexDistance(moveTo, enemy.position)
    if (distance === 1) return build(moveTo, 'melee')
    const blocked = (h: HexCoord) => view.terrain[hexIndex(h, view.width)] === 'blocked'
    if (
      view.stackRange >= 2 &&
      distance >= 2 &&
      distance <= view.stackRange &&
      hexLineOfSight(moveTo, enemy.position, blocked)
    ) {
      return build(moveTo, 'ranged')
    }
    return null
  }

  // Prefer the shot: it draws no retaliation, and a ranged stack in melee swings
  // at the archer penalty. `null` from/rangedFrom/attackFrom = act in place.
  if (option.rangedFrom !== undefined) return build(option.rangedFrom, 'ranged')
  if (option.attackFrom !== undefined) return build(option.attackFrom, 'melee')
  return null
}

export interface StackLoss {
  side: 'attacker' | 'defender'
  unitId: string
  before: number
  after: number
}

type ViewStacks = Pick<BoardActivationView, 'stack' | 'allies' | 'enemies'>

/**
 * Stacks that lost units between two of the player's activations — everything
 * that happened while the enemy (and any faster allies) acted. Powers the
 * "since your last order" caption; a wiped stack reports `after: 0`.
 */
export function stackLosses(prev: ViewStacks, next: ViewStacks): StackLoss[] {
  const all = (v: ViewStacks): BoardStack[] => [v.stack, ...v.allies, ...v.enemies]
  const after = new Map(all(next).map((s) => [s.id, s.count]))
  const losses: StackLoss[] = []
  for (const s of all(prev)) {
    const now = after.get(s.id) ?? 0
    if (now < s.count) losses.push({ side: s.side, unitId: s.unitId, before: s.count, after: now })
  }
  return losses
}
