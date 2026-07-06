import {
  hexDistance,
  hexEquals,
  hexIndex,
  hexLineOfSight,
  type BoardActivationView,
  type BoardCommand,
  type BoardStack,
  type BoardTerrain,
  type HexCoord,
} from '@aop/engine'

/**
 * Interactive boarding-melee planner (#93): the pure hex-planning helpers the
 * command sheet taps go through (`planMove`, `planAttack`, `stackLosses`).
 * The probe itself — `probeBoardingBattle`, plus the naval-AI driver
 * selection it must mirror bit-for-bit — now lives in `@aop/engine`'s
 * `boardingProbe.ts` and is just re-exported here (#285): a multiplayer
 * client has no live `GameState` to probe locally (docs/MULTIPLAYER.md §7),
 * so the identical function is called server-side too
 * (`supabase/functions/_shared/match.ts`'s `probeBoarding`) — one
 * implementation, not two that could drift.
 */
export {
  aiTacticDriverForOwner as navalAiDriverFor,
  probeBoardingBattle,
  type BoardingProbeOutcome,
} from '@aop/engine'

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
