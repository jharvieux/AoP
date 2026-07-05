import {
  combatantStrength,
  type BattleTuning,
  type CombatInput,
  type CombatResult,
  type CombatStats,
  type RoundReport,
} from './combat'
import { hexDistance, hexEquals, hexFromIndex, hexIndex, hexNeighbors, type HexCoord } from './hex'
import { nextFloat, type RngState } from './rng'
import type { TroopStack } from './types'

/**
 * Tactical battle board (#39) — the HoMM-style hex battlefield for troop
 * combat (boarding melees and, later, land assaults).
 *
 * A battle is a deterministic simulation over plain data: troop stacks deploy
 * on a rectangular hex board (odd-r offset coordinates, integer-only math),
 * act in initiative order round by round, move under terrain costs, and trade
 * melee blows with one retaliation per defender per round. All randomness is
 * the seeded RNG threaded through {@link RngState}; two runs from the same
 * input and state are bit-identical — the replay/authority contract.
 *
 * Three drivers feed the same resolver, mirroring the naval tactics layer
 * (#18): the AI ({@link boardAiDriver}, with easy/normal/hard profiles), an
 * interactive player's recorded per-activation commands
 * ({@link boardPlanDriver} — the action log carries the commands, so replays
 * are exact), and an offline defender's conditional doctrine
 * ({@link boardOrdersDriver}). Auto-resolve is the AI driving both sides.
 */

export type BoardTerrain = 'open' | 'rough' | 'cover' | 'blocked'

/** What kind of ground the battle is fought on; picks the terrain-density profile. */
export type BattleContext = 'boarding' | 'land'

export type BoardSide = 'attacker' | 'defender'

/** One troop stack on the board. Plain data; positions are integer hex coords. */
export interface BoardStack {
  id: number
  side: BoardSide
  unitId: string
  count: number
  /** Remaining health of the stack's wounded top unit (starts at full unit health). */
  topHp: number
  position: HexCoord
  /** Round in which this stack last retaliated (one retaliation per round). */
  retaliatedRound: number
  /** True after a hold command, until the stack's next activation. */
  holding: boolean
}

/**
 * One recorded activation command, as stored in the action log. `to` moves the
 * stack (must be reachable this activation), `targetId` melee-attacks an
 * adjacent enemy after any move; neither means hold (defensive posture). A
 * command that is illegal at execution time degrades to hold — recorded plans
 * can therefore never desync a replay, only fight worse.
 */
export interface BoardCommand {
  stackId: number
  to?: HexCoord
  targetId?: number
}

/** Conditions a board standing order may key on; evaluated at each activation. */
export type BoardOrderCondition = 'always' | 'outnumbered' | 'winning' | 'losing'

export const BOARD_ORDER_CONDITIONS: readonly BoardOrderCondition[] = [
  'always',
  'outnumbered',
  'winning',
  'losing',
]

/** Fighting doctrines a standing order can select; each maps to a deterministic behavior. */
export type BoardDoctrine = 'holdLine' | 'advance' | 'skirmish'

export const BOARD_DOCTRINES: readonly BoardDoctrine[] = ['holdLine', 'advance', 'skirmish']

/** One rule of an async defender's board plan: "when <condition>, fight <doctrine>". */
export interface BoardOrder {
  when: BoardOrderCondition
  doctrine: BoardDoctrine
}

export type BoardAiProfile = 'easy' | 'normal' | 'hard'

/** A reachable destination for the acting stack, with its movement cost. */
export interface BoardReachableHex {
  hex: HexCoord
  cost: number
}

/** An enemy stack the acting stack can engage or approach this activation. */
export interface BoardTargetOption {
  targetId: number
  /** Hex to attack from (`null` = already adjacent, attack in place); undefined = not attackable now. */
  attackFrom?: HexCoord | null
  /** Best reachable hex that closes distance to this target; absent when boxed in. */
  approachHex?: HexCoord
  /** Hex distance from the acting stack's current position to the target. */
  distance: number
  /** Target's total remaining hit points — the shared focus-fire currency. */
  targetHp: number
}

/** Everything a driver may see when choosing a command. The board is fully visible to both sides. */
export interface BoardActivationView {
  round: number
  stack: BoardStack
  allies: BoardStack[]
  enemies: BoardStack[]
  width: number
  height: number
  terrain: BoardTerrain[]
  reachable: BoardReachableHex[]
  targets: BoardTargetOption[]
  ownTotalHp: number
  enemyTotalHp: number
  tuning: BattleTuning
}

export interface BoardDriver {
  choose(view: BoardActivationView): BoardCommand
}

export interface BoardDrivers {
  attacker: BoardDriver
  defender: BoardDriver
}

/** One entry of the battle log — enough for a client to replay the fight visually. */
export type BoardEvent =
  | { round: number; stackId: number; type: 'move'; from: HexCoord; to: HexCoord }
  | {
      round: number
      stackId: number
      type: 'attack' | 'retaliation'
      targetId: number
      damage: number
      kills: number
      /** Target stack size after the blow. */
      targetCount: number
      flanked: boolean
    }
  | { round: number; stackId: number; type: 'hold' }

/** Full structured record of a board battle, attached to the {@link BattleReport}. */
export interface BoardBattleLog {
  context: BattleContext
  width: number
  height: number
  terrain: BoardTerrain[]
  /** Initial deployment (id/side/unit/count/position at round 0). */
  stacks: { id: number; side: BoardSide; unitId: string; count: number; position: HexCoord }[]
  events: BoardEvent[]
  rounds: number
  winnerSide: BoardSide
}

export interface BoardBattleResult {
  winnerSide: BoardSide
  attackerTroops: TroopStack[]
  defenderTroops: TroopStack[]
  rng: RngState
  log: BoardBattleLog
}

interface BoardBattle {
  width: number
  height: number
  terrain: BoardTerrain[]
  stacks: BoardStack[]
  round: number
  tuning: BattleTuning
  stats: CombatStats
  /** Captain skill bonuses per side, applied to every stack of that side. */
  attackBonusPct: Record<BoardSide, number>
  defenseBonusPct: Record<BoardSide, number>
}

function unitSpeed(battle: BoardBattle, unitId: string): number {
  return battle.stats.unit(unitId).speed ?? battle.tuning.defaultUnitSpeed
}

function unitHealth(battle: BoardBattle, unitId: string): number {
  return battle.stats.unit(unitId).health
}

export function stackTotalHp(stack: BoardStack, unitHealthValue: number): number {
  if (stack.count <= 0) return 0
  return stack.topHp + (stack.count - 1) * unitHealthValue
}

function sideTotalHp(battle: BoardBattle, side: BoardSide): number {
  return battle.stacks.reduce(
    (sum, s) =>
      s.side === side && s.count > 0 ? sum + stackTotalHp(s, unitHealth(battle, s.unitId)) : sum,
    0,
  )
}

function livingStacks(battle: BoardBattle, side?: BoardSide): BoardStack[] {
  return battle.stacks.filter((s) => s.count > 0 && (side === undefined || s.side === side))
}

/** Deployment rows, center-out, so small armies hold the middle of their edge. */
function deploymentRows(height: number, count: number): number[] {
  const mid = Math.floor((height - 1) / 2)
  const rows: number[] = [mid]
  for (let step = 1; rows.length < count && step < height; step++) {
    if (mid + step < height) rows.push(mid + step)
    if (rows.length < count && mid - step >= 0) rows.push(mid - step)
  }
  return rows.slice(0, count)
}

/**
 * Generate battlefield terrain from the seeded RNG. Spawn columns are always
 * open; a straight open lane across the middle row is guaranteed afterwards if
 * the obstacle roll happened to wall the two sides apart.
 */
function generateTerrain(
  width: number,
  height: number,
  tuning: BattleTuning,
  context: BattleContext,
  rng: RngState,
): [RngState, BoardTerrain[]] {
  const blocked = context === 'boarding' ? tuning.boardingBlockedDensity : tuning.landBlockedDensity
  const cover = context === 'boarding' ? tuning.boardingCoverDensity : tuning.landCoverDensity
  const rough = context === 'boarding' ? tuning.boardingRoughDensity : tuning.landRoughDensity

  const terrain: BoardTerrain[] = new Array<BoardTerrain>(width * height).fill('open')
  let state = rng
  for (let row = 0; row < height; row++) {
    for (let col = 1; col < width - 1; col++) {
      let roll: number
      ;[state, roll] = nextFloat(state)
      if (roll < blocked) terrain[row * width + col] = 'blocked'
      else if (roll < blocked + rough) terrain[row * width + col] = 'rough'
      else if (roll < blocked + rough + cover) terrain[row * width + col] = 'cover'
    }
  }

  if (!spawnColumnsConnected(terrain, width, height)) {
    const mid = Math.floor(height / 2)
    for (let col = 0; col < width; col++) {
      if (terrain[mid * width + col] === 'blocked') terrain[mid * width + col] = 'open'
    }
  }
  return [state, terrain]
}

/** True if a non-blocked path exists from the attacker's spawn column to the defender's. */
function spawnColumnsConnected(terrain: BoardTerrain[], width: number, height: number): boolean {
  const visited = new Set<number>()
  const queue: HexCoord[] = []
  for (let row = 0; row < height; row++) {
    queue.push({ col: 0, row })
    visited.add(row * width)
  }
  while (queue.length > 0) {
    const hex = queue.shift()!
    if (hex.col === width - 1) return true
    for (const n of hexNeighbors(hex, width, height)) {
      const idx = hexIndex(n, width)
      if (visited.has(idx) || terrain[idx] === 'blocked') continue
      visited.add(idx)
      queue.push(n)
    }
  }
  return false
}

function setupBattle(
  input: CombatInput,
  stats: CombatStats,
  rng: RngState,
  context: BattleContext,
): [RngState, BoardBattle] {
  const tuning = stats.battle
  if (!tuning) throw new Error('No battle tuning configured — board combat is unavailable')
  const { boardWidth: width, boardHeight: height } = tuning

  const [state, terrain] = generateTerrain(width, height, tuning, context, rng)

  const stacks: BoardStack[] = []
  let id = 0
  for (const side of ['attacker', 'defender'] as const) {
    const troops = input[side].troops.filter((t) => t.count > 0).slice(0, tuning.maxStacksPerSide)
    const rows = deploymentRows(height, troops.length)
    const col = side === 'attacker' ? 0 : width - 1
    troops.forEach((t, i) => {
      stacks.push({
        id: id++,
        side,
        unitId: t.unitId,
        count: t.count,
        topHp: stats.unit(t.unitId).health,
        position: { col, row: rows[i]! },
        retaliatedRound: 0,
        holding: false,
      })
    })
  }

  return [
    state,
    {
      width,
      height,
      terrain,
      stacks,
      round: 0,
      tuning,
      stats,
      attackBonusPct: {
        attacker: input.attacker.attackBonusPct ?? 0,
        defender: input.defender.attackBonusPct ?? 0,
      },
      defenseBonusPct: {
        attacker: input.attacker.defenseBonusPct ?? 0,
        defender: input.defender.defenseBonusPct ?? 0,
      },
    },
  ]
}

/**
 * Initiative for one round: faster units first; ties break attacker-first,
 * then by stack id — fully deterministic.
 */
export function initiativeOrder(
  stacks: readonly BoardStack[],
  speedOf: (unitId: string) => number,
): number[] {
  return stacks
    .filter((s) => s.count > 0)
    .slice()
    .sort((a, b) => {
      const speed = speedOf(b.unitId) - speedOf(a.unitId)
      if (speed !== 0) return speed
      if (a.side !== b.side) return a.side === 'attacker' ? -1 : 1
      return a.id - b.id
    })
    .map((s) => s.id)
}

function moveCost(battle: BoardBattle, hex: HexCoord): number | null {
  const t = battle.terrain[hexIndex(hex, battle.width)]
  if (t === 'blocked') return null
  return t === 'rough' ? battle.tuning.roughMoveCost : 1
}

/**
 * Integer-cost Dijkstra from the stack's position, budgeted by unit speed.
 * Units and blocked hexes are impassable (no moving through a melee line).
 * Returns reachable destinations only (current hex excluded).
 */
export function reachableHexes(battle: BoardBattle, stack: BoardStack): BoardReachableHex[] {
  const budget = unitSpeed(battle, stack.unitId)
  const occupied = new Set(
    livingStacks(battle)
      .filter((s) => s.id !== stack.id)
      .map((s) => hexIndex(s.position, battle.width)),
  )
  const best = new Map<number, number>([[hexIndex(stack.position, battle.width), 0]])
  // The frontier stays tiny (≤ board size); a sorted scan beats a heap here.
  const frontier: { hex: HexCoord; cost: number }[] = [{ hex: stack.position, cost: 0 }]
  const out: BoardReachableHex[] = []

  while (frontier.length > 0) {
    let bestIdx = 0
    for (let i = 1; i < frontier.length; i++) {
      if (frontier[i]!.cost < frontier[bestIdx]!.cost) bestIdx = i
    }
    const { hex, cost } = frontier.splice(bestIdx, 1)[0]!
    if (best.get(hexIndex(hex, battle.width))! < cost) continue
    for (const n of hexNeighbors(hex, battle.width, battle.height)) {
      const idx = hexIndex(n, battle.width)
      if (occupied.has(idx)) continue
      const step = moveCost(battle, n)
      if (step === null) continue
      const total = cost + step
      if (total > budget) continue
      const prev = best.get(idx)
      if (prev !== undefined && prev <= total) continue
      best.set(idx, total)
      frontier.push({ hex: n, cost: total })
    }
  }

  for (const [idx, cost] of best) {
    if (cost === 0) continue
    out.push({ hex: hexFromIndex(idx, battle.width), cost })
  }
  out.sort((a, b) => hexIndex(a.hex, battle.width) - hexIndex(b.hex, battle.width))
  return out
}

function buildTargets(
  battle: BoardBattle,
  stack: BoardStack,
  reachable: BoardReachableHex[],
): BoardTargetOption[] {
  const reachByIndex = new Map(reachable.map((r) => [hexIndex(r.hex, battle.width), r]))
  const options: BoardTargetOption[] = []

  for (const enemy of livingStacks(battle)) {
    if (enemy.side === stack.side) continue
    const distance = hexDistance(stack.position, enemy.position)
    const option: BoardTargetOption = {
      targetId: enemy.id,
      distance,
      targetHp: stackTotalHp(enemy, unitHealth(battle, enemy.unitId)),
    }

    if (distance === 1) {
      option.attackFrom = null
    } else {
      // Cheapest reachable hex adjacent to the enemy; ties break on hex index.
      let bestFrom: BoardReachableHex | null = null
      for (const n of hexNeighbors(enemy.position, battle.width, battle.height)) {
        const r = reachByIndex.get(hexIndex(n, battle.width))
        if (!r) continue
        if (
          !bestFrom ||
          r.cost < bestFrom.cost ||
          (r.cost === bestFrom.cost &&
            hexIndex(r.hex, battle.width) < hexIndex(bestFrom.hex, battle.width))
        ) {
          bestFrom = r
        }
      }
      if (bestFrom) option.attackFrom = bestFrom.hex
    }

    // Best approach: reachable hex closest to the enemy (ties: cheaper, then index).
    let approach: BoardReachableHex | null = null
    let approachDist = distance
    for (const r of reachable) {
      const d = hexDistance(r.hex, enemy.position)
      if (
        d < approachDist ||
        (d === approachDist &&
          approach !== null &&
          (r.cost < approach.cost ||
            (r.cost === approach.cost &&
              hexIndex(r.hex, battle.width) < hexIndex(approach.hex, battle.width))))
      ) {
        approach = r
        approachDist = d
      }
    }
    if (approach) option.approachHex = approach.hex

    options.push(option)
  }

  options.sort((a, b) => a.targetId - b.targetId)
  return options
}

function buildView(battle: BoardBattle, stack: BoardStack): BoardActivationView {
  const reachable = reachableHexes(battle, stack)
  return {
    round: battle.round,
    stack: { ...stack, position: { ...stack.position } },
    allies: livingStacks(battle, stack.side)
      .filter((s) => s.id !== stack.id)
      .map((s) => ({ ...s, position: { ...s.position } })),
    enemies: livingStacks(battle, stack.side === 'attacker' ? 'defender' : 'attacker').map((s) => ({
      ...s,
      position: { ...s.position },
    })),
    width: battle.width,
    height: battle.height,
    terrain: battle.terrain,
    reachable,
    targets: buildTargets(battle, stack, reachable),
    ownTotalHp: sideTotalHp(battle, stack.side),
    enemyTotalHp: sideTotalHp(battle, stack.side === 'attacker' ? 'defender' : 'attacker'),
    tuning: battle.tuning,
  }
}

/** Apply integer damage to a stack via the total-HP model; returns units killed. */
function applyStackDamage(battle: BoardBattle, stack: BoardStack, damage: number): number {
  const health = unitHealth(battle, stack.unitId)
  const before = stackTotalHp(stack, health)
  const after = Math.max(0, before - damage)
  const countBefore = stack.count
  stack.count = after === 0 ? 0 : Math.ceil(after / health)
  stack.topHp = after === 0 ? 0 : after - (stack.count - 1) * health
  return countBefore - stack.count
}

function strike(
  battle: BoardBattle,
  attacker: BoardStack,
  target: BoardStack,
  rng: RngState,
  kind: 'attack' | 'retaliation',
): [RngState, BoardEvent] {
  const t = battle.tuning
  const a = battle.stats.unit(attacker.unitId)
  const d = battle.stats.unit(target.unitId)

  let state = rng
  let roll: number
  ;[state, roll] = nextFloat(state)

  const diff = Math.min(
    t.maxDamageModifier,
    Math.max(t.minDamageModifier, 1 + t.attackDefenseFactor * (a.attack - d.defense)),
  )
  // Flanking rewards coordination: a second friendly stack on the target's flank
  // opens its guard. Retaliations never flank — they are a reflexive answer.
  const flanked =
    kind === 'attack' &&
    livingStacks(battle, attacker.side).some(
      (s) => s.id !== attacker.id && hexDistance(s.position, target.position) === 1,
    )

  let raw =
    attacker.count *
    a.attack *
    (t.damageRollMin + roll * t.damageRollSpread) *
    diff *
    ((100 + battle.attackBonusPct[attacker.side]) / (100 + battle.defenseBonusPct[target.side]))
  if (flanked) raw *= t.flankingBonus
  if (battle.terrain[hexIndex(target.position, battle.width)] === 'cover') {
    raw *= 1 - t.coverDamageReduction
  }
  if (target.holding) raw *= 1 - t.holdDamageReduction

  const damage = Math.max(1, Math.round(raw))
  const kills = applyStackDamage(battle, target, damage)

  return [
    state,
    {
      round: battle.round,
      stackId: attacker.id,
      type: kind,
      targetId: target.id,
      damage,
      kills,
      targetCount: target.count,
      flanked,
    },
  ]
}

/** Validate + execute one activation command; illegal commands degrade to hold. */
function executeCommand(
  battle: BoardBattle,
  stack: BoardStack,
  command: BoardCommand,
  view: BoardActivationView,
  events: BoardEvent[],
  rng: RngState,
): RngState {
  let state = rng

  let position = stack.position
  if (command.to) {
    const dest = command.to
    const legal = view.reachable.some((r) => hexEquals(r.hex, dest))
    if (!legal) {
      events.push({ round: battle.round, stackId: stack.id, type: 'hold' })
      stack.holding = true
      return state
    }
    events.push({
      round: battle.round,
      stackId: stack.id,
      type: 'move',
      from: { ...stack.position },
      to: { ...dest },
    })
    stack.position = { ...dest }
    position = stack.position
  }

  if (command.targetId !== undefined) {
    const target = battle.stacks.find((s) => s.id === command.targetId)
    const legal =
      target &&
      target.count > 0 &&
      target.side !== stack.side &&
      hexDistance(position, target.position) === 1
    if (!legal) {
      if (!command.to) {
        events.push({ round: battle.round, stackId: stack.id, type: 'hold' })
        stack.holding = true
      }
      return state
    }
    let event: BoardEvent
    ;[state, event] = strike(battle, stack, target, state, 'attack')
    events.push(event)

    if (target.count > 0 && target.retaliatedRound < battle.round) {
      target.retaliatedRound = battle.round
      ;[state, event] = strike(battle, target, stack, state, 'retaliation')
      events.push(event)
    }
    return state
  }

  if (!command.to) {
    events.push({ round: battle.round, stackId: stack.id, type: 'hold' })
    stack.holding = true
  }
  return state
}

/** Aggregate a side's surviving stacks back into the ship-hold troop shape. */
function survivorTroops(battle: BoardBattle, side: BoardSide): TroopStack[] {
  const byUnit = new Map<string, number>()
  for (const s of livingStacks(battle, side)) {
    byUnit.set(s.unitId, (byUnit.get(s.unitId) ?? 0) + s.count)
  }
  return [...byUnit.entries()].map(([unitId, count]) => ({ unitId, count }))
}

/**
 * Resolve a full board battle. Deterministic in its arguments; the returned
 * RNG state must be threaded back into GameState by the caller.
 */
export function resolveBoardBattle(
  input: CombatInput,
  stats: CombatStats,
  rng: RngState,
  drivers: BoardDrivers,
  context: BattleContext,
): BoardBattleResult {
  let [state, battle] = setupBattle(input, stats, rng, context)
  const events: BoardEvent[] = []
  const initialStacks = battle.stacks.map((s) => ({
    id: s.id,
    side: s.side,
    unitId: s.unitId,
    count: s.count,
    position: { ...s.position },
  }))

  const bothAlive = () =>
    livingStacks(battle, 'attacker').length > 0 && livingStacks(battle, 'defender').length > 0

  while (bothAlive() && battle.round < battle.tuning.maxRounds) {
    battle.round++
    const order = initiativeOrder(battle.stacks, (unitId) => unitSpeed(battle, unitId))
    for (const stackId of order) {
      const stack = battle.stacks.find((s) => s.id === stackId)!
      if (stack.count <= 0) continue
      stack.holding = false
      const view = buildView(battle, stack)
      const driver = stack.side === 'attacker' ? drivers.attacker : drivers.defender
      state = executeCommand(battle, stack, driver.choose(view), view, events, state)
      if (!bothAlive()) break
    }
  }

  // A wiped side loses outright; at the round cap the fresher side holds the
  // deck/field, and a dead-even tie goes to the defender (the attacker failed).
  const attackerHp = sideTotalHp(battle, 'attacker')
  const defenderHp = sideTotalHp(battle, 'defender')
  const winnerSide: BoardSide = attackerHp > defenderHp ? 'attacker' : 'defender'

  return {
    winnerSide,
    attackerTroops: survivorTroops(battle, 'attacker'),
    defenderTroops: survivorTroops(battle, 'defender'),
    rng: state,
    log: {
      context,
      width: battle.width,
      height: battle.height,
      terrain: battle.terrain,
      stacks: initialStacks,
      events,
      rounds: battle.round,
      winnerSide,
    },
  }
}

/* ------------------------------------------------------------------------- *
 * Drivers
 * ------------------------------------------------------------------------- */

function lowestHpTarget(targets: readonly BoardTargetOption[]): BoardTargetOption | null {
  let best: BoardTargetOption | null = null
  for (const t of targets) {
    if (
      !best ||
      t.targetHp < best.targetHp ||
      (t.targetHp === best.targetHp && t.targetId < best.targetId)
    ) {
      best = t
    }
  }
  return best
}

function attackCommand(stackId: number, option: BoardTargetOption): BoardCommand {
  const cmd: BoardCommand = { stackId, targetId: option.targetId }
  if (option.attackFrom) cmd.to = option.attackFrom
  return cmd
}

/** Nearest enemy (ties: lower id); the default march target when out of reach. */
function nearestTarget(targets: readonly BoardTargetOption[]): BoardTargetOption | null {
  let best: BoardTargetOption | null = null
  for (const t of targets) {
    if (
      !best ||
      t.distance < best.distance ||
      (t.distance === best.distance && t.targetId < best.targetId)
    ) {
      best = t
    }
  }
  return best
}

function doctrineCommand(view: BoardActivationView, doctrine: BoardDoctrine): BoardCommand {
  const { stack, targets } = view
  const attackable = targets.filter((t) => t.attackFrom !== undefined)
  const adjacent = targets.filter((t) => t.attackFrom === null)

  switch (doctrine) {
    case 'holdLine': {
      // Keep formation: never leave the line, punish whatever comes adjacent.
      const target = lowestHpTarget(adjacent)
      return target ? attackCommand(stack.id, target) : { stackId: stack.id }
    }
    case 'advance': {
      const target = lowestHpTarget(attackable)
      if (target) return attackCommand(stack.id, target)
      const march = nearestTarget(targets)
      if (march?.approachHex) return { stackId: stack.id, to: march.approachHex }
      return { stackId: stack.id }
    }
    case 'skirmish': {
      // Hit whoever is already in reach without moving, otherwise keep distance.
      const target = lowestHpTarget(adjacent)
      if (target) return attackCommand(stack.id, target)
      let bestHex: HexCoord | null = null
      let bestDist = view.enemies.reduce(
        (min, e) => Math.min(min, hexDistance(stack.position, e.position)),
        Infinity,
      )
      for (const r of view.reachable) {
        const d = view.enemies.reduce(
          (min, e) => Math.min(min, hexDistance(r.hex, e.position)),
          Infinity,
        )
        if (d > bestDist) {
          bestDist = d
          bestHex = r.hex
        }
      }
      return bestHex ? { stackId: stack.id, to: bestHex } : { stackId: stack.id }
    }
  }
}

/**
 * The board AI. Deterministic (no RNG) so the same battle always replays the
 * same way regardless of which machine drives it:
 *
 * - `easy` holds the line — it never advances, only punishing adjacent enemies.
 * - `normal` adapts to the ground — engages what it can reach, prefers striking
 *   from cover, and marches on the nearest enemy otherwise.
 * - `hard` presses advantages — focuses the weakest enemy stack, maneuvers onto
 *   flanking hexes beside an engaged ally, and takes cover on the approach.
 */
export function boardAiDriver(profile: BoardAiProfile): BoardDriver {
  return {
    choose(view) {
      const { stack, targets } = view
      if (profile === 'easy') return doctrineCommand(view, 'holdLine')
      if (profile === 'normal') {
        const attackable = targets.filter((t) => t.attackFrom !== undefined)
        const target = lowestHpTarget(attackable)
        if (target) {
          // Terrain-aware: if an equally valid adjacent cover hex exists, strike from it.
          if (target.attackFrom) {
            const covered = coveredAttackHex(view, target)
            if (covered) return { stackId: stack.id, to: covered, targetId: target.targetId }
          }
          return attackCommand(stack.id, target)
        }
        const march = nearestTarget(targets)
        if (march?.approachHex) {
          return { stackId: stack.id, to: preferCover(view, march.approachHex) }
        }
        return { stackId: stack.id }
      }

      // hard: focus fire the weakest enemy on the board, flank when possible.
      const focus = lowestHpTarget(targets)
      if (!focus) return { stackId: stack.id }
      if (focus.attackFrom !== undefined) {
        const flankHex = flankingAttackHex(view, focus)
        if (flankHex) return { stackId: stack.id, to: flankHex, targetId: focus.targetId }
        return attackCommand(stack.id, focus)
      }
      // Can't reach the focus target: hit anything else in reach rather than idle.
      const attackable = targets.filter((t) => t.attackFrom !== undefined)
      const fallback = lowestHpTarget(attackable)
      if (fallback) return attackCommand(stack.id, fallback)
      if (focus.approachHex) return { stackId: stack.id, to: preferCover(view, focus.approachHex) }
      return { stackId: stack.id }
    },
  }
}

/** A reachable cover hex adjacent to the target, if one costs no more than the planned hop. */
function coveredAttackHex(view: BoardActivationView, target: BoardTargetOption): HexCoord | null {
  const enemy = view.enemies.find((e) => e.id === target.targetId)
  if (!enemy) return null
  for (const r of view.reachable) {
    if (hexDistance(r.hex, enemy.position) !== 1) continue
    if (view.terrain[hexIndex(r.hex, view.width)] === 'cover') return r.hex
  }
  return null
}

/** A reachable hex adjacent to the target AND beside an ally already engaging it. */
function flankingAttackHex(view: BoardActivationView, target: BoardTargetOption): HexCoord | null {
  const enemy = view.enemies.find((e) => e.id === target.targetId)
  if (!enemy) return null
  const engaged = view.allies.some((a) => hexDistance(a.position, enemy.position) === 1)
  if (!engaged) return null
  if (target.attackFrom === null) return null // already adjacent — just swing
  let best: HexCoord | null = null
  for (const r of view.reachable) {
    if (hexDistance(r.hex, enemy.position) !== 1) continue
    if (!best || hexIndex(r.hex, view.width) < hexIndex(best, view.width)) best = r.hex
  }
  return best
}

/** Swap a march destination for an equally-close cover hex when one is reachable. */
function preferCover(view: BoardActivationView, hex: HexCoord): HexCoord {
  if (view.terrain[hexIndex(hex, view.width)] === 'cover') return hex
  const enemy = nearestTarget(view.targets)
  const enemyStack = enemy ? view.enemies.find((e) => e.id === enemy.targetId) : undefined
  if (!enemyStack) return hex
  const targetDist = hexDistance(hex, enemyStack.position)
  for (const r of view.reachable) {
    if (view.terrain[hexIndex(r.hex, view.width)] !== 'cover') continue
    if (hexDistance(r.hex, enemyStack.position) === targetDist) return r.hex
  }
  return hex
}

/**
 * Replays an interactive player's recorded commands, one per activation, in
 * order. The plan must track the battle exactly (same stacks, same order); the
 * moment a command names the wrong stack the plan is abandoned and the AI
 * finishes the fight — a stale or tampered plan can lose a battle but can
 * never corrupt a replay.
 */
export function boardPlanDriver(
  commands: readonly BoardCommand[],
  fallback: BoardDriver = boardAiDriver('normal'),
): BoardDriver {
  let cursor = 0
  let abandoned = false
  return {
    choose(view) {
      if (abandoned || cursor >= commands.length) return fallback.choose(view)
      const command = commands[cursor]!
      if (command.stackId !== view.stack.id) {
        abandoned = true
        return fallback.choose(view)
      }
      cursor++
      return command
    },
  }
}

/**
 * Standing orders for the board — the async defender's melee doctrine,
 * mirroring the naval {@link standingOrdersDriver}. First matching rule wins;
 * no match falls back to `advance`.
 */
export function boardOrdersDriver(orders: readonly BoardOrder[]): BoardDriver {
  return {
    choose(view) {
      for (const order of orders) {
        if (boardConditionHolds(order.when, view)) return doctrineCommand(view, order.doctrine)
      }
      return doctrineCommand(view, 'advance')
    },
  }
}

function boardConditionHolds(when: BoardOrderCondition, view: BoardActivationView): boolean {
  switch (when) {
    case 'always':
      return true
    case 'outnumbered':
      return view.enemyTotalHp >= view.ownTotalHp * view.tuning.outnumberedRatio
    case 'winning':
      return view.ownTotalHp > view.enemyTotalHp
    case 'losing':
      return view.ownTotalHp < view.enemyTotalHp
  }
}

/**
 * Resolve a pure troop battle (no ships) on the board, behind the same
 * resolver interface as {@link resolveCombat}: `CombatInput` in,
 * {@link CombatResult} out. This is the land-combat entry point — city
 * assaults and shore fights plug in here without touching networking or
 * persistence, exactly as docs/ARCHITECTURE.md §6 planned.
 */
export function resolveBoardCombat(
  input: CombatInput,
  stats: CombatStats,
  rng: RngState,
  drivers?: Partial<BoardDrivers>,
  context: BattleContext = 'land',
): CombatResult {
  const result = resolveBoardBattle(
    input,
    stats,
    rng,
    {
      attacker: drivers?.attacker ?? boardAiDriver('normal'),
      defender: drivers?.defender ?? boardAiDriver('normal'),
    },
    context,
  )

  const winnerId =
    result.winnerSide === 'attacker' ? input.attacker.ownerId : input.defender.ownerId
  const loserId = result.winnerSide === 'attacker' ? input.defender.ownerId : input.attacker.ownerId

  // Summarize board rounds in the shared report shape so every consumer of
  // BattleReport (UI, logs, tests) reads land battles like naval ones.
  const rounds: RoundReport[] = []
  const health = (unitId: string) => stats.unit(unitId).health
  const sideOf = new Map(result.log.stacks.map((s) => [s.id, s.side]))
  let attackerHp = result.log.stacks
    .filter((s) => s.side === 'attacker')
    .reduce((sum, s) => sum + s.count * health(s.unitId), 0)
  let defenderHp = result.log.stacks
    .filter((s) => s.side === 'defender')
    .reduce((sum, s) => sum + s.count * health(s.unitId), 0)
  for (let r = 1; r <= result.log.rounds; r++) {
    let attackerDamage = 0
    let defenderDamage = 0
    for (const e of result.log.events) {
      if (e.round !== r || (e.type !== 'attack' && e.type !== 'retaliation')) continue
      if (sideOf.get(e.stackId) === 'attacker') {
        attackerDamage += e.damage
        defenderHp = Math.max(0, defenderHp - e.damage)
      } else {
        defenderDamage += e.damage
        attackerHp = Math.max(0, attackerHp - e.damage)
      }
    }
    rounds.push({
      round: r,
      attackerTactic: null,
      defenderTactic: null,
      attackerDamage,
      defenderDamage,
      attackerHp,
      defenderHp,
    })
  }

  return {
    report: {
      attacker: {
        ownerId: input.attacker.ownerId,
        captainId: input.attacker.captainId,
        shipClassId: input.attacker.shipClassId,
        strength: combatantStrength(input.attacker, stats),
        troops: input.attacker.troops.map((t) => ({ ...t })),
      },
      defender: {
        ownerId: input.defender.ownerId,
        captainId: input.defender.captainId,
        shipClassId: input.defender.shipClassId,
        strength: combatantStrength(input.defender, stats),
        troops: input.defender.troops.map((t) => ({ ...t })),
      },
      rounds,
      winnerId,
      loserId,
      attackerSurvived: result.winnerSide === 'attacker',
      defenderSurvived: result.winnerSide === 'defender',
      escapedId: null,
      survivingTroops: {
        attacker: result.attackerTroops,
        defender: result.defenderTroops,
      },
      board: result.log,
    },
    rng: result.rng,
    attackerTroops: result.attackerTroops,
    defenderTroops: result.defenderTroops,
  }
}
