import {
  applyActionWithOutcome,
  captainsOf,
  createGame,
  hexDistance,
  type BattleTuning,
  type BoardActivationView,
  type BoardCommand,
  type BoardStack,
  type CombatStatsData,
  type GameConfig,
  type GameState,
  type TroopStack,
} from '@aop/engine'
import { describe, expect, it } from 'vitest'
import { planAttack, planMove, probeBoardingBattle, stackLosses } from './boardingPlanner'

/**
 * The boarding planner (#93) records the player's melee commands by probing
 * the engine's own battle simulation. The load-bearing contract: a plan
 * recorded through the probe must replay bit-identically through the reducer
 * when submitted as `attackCaptain.boardCommands` — these tests are that
 * contract, plus the pure command-builders the sheet taps go through.
 *
 * Balance numbers are test-local fixtures (mirroring the engine's own board
 * tests), not @aop/content data, so a rebalance never silently changes what
 * these tests exercise.
 */

const UNITS = [
  { id: 'grunt', attack: 5, defense: 2, health: 12, speed: 5 },
  { id: 'archer', attack: 4, defense: 1, health: 8, speed: 6, range: 3 },
]
const SHIPS = [{ id: 'sloop', hull: 40, cannons: 6, speed: 5 }]

const BATTLE_TUNING: BattleTuning = {
  boardWidth: 11,
  boardHeight: 8,
  maxStacksPerSide: 7,
  maxRounds: 30,
  defaultUnitSpeed: 4,
  damageRollMin: 0.9,
  damageRollSpread: 0.2,
  attackDefenseFactor: 0.05,
  minDamageModifier: 0.4,
  maxDamageModifier: 2,
  flankingBonus: 1.2,
  coverDamageReduction: 0.25,
  rangedCoverDamageReduction: 0.5,
  rangedMeleePenalty: 0.5,
  holdDamageReduction: 0.15,
  roughMoveCost: 2,
  boardingBlockedDensity: 0.12,
  boardingRoughDensity: 0,
  boardingCoverDensity: 0.06,
  landBlockedDensity: 0.08,
  landRoughDensity: 0.12,
  landCoverDensity: 0.1,
  outnumberedRatio: 1.5,
}

/** `battle: null` builds a pre-#39 snapshot with no board tuning at all. */
function statsData(battle: BattleTuning | null): CombatStatsData {
  return {
    units: UNITS,
    ships: SHIPS,
    combat: {
      maxRounds: 20,
      damageRollMin: 0.85,
      damageRollSpread: 0.3,
      hullStrengthWeight: 0.25,
      cannonStrengthWeight: 1,
      troopDefenseWeight: 0.5,
      damageScale: 0.35,
    },
    tactics: { advantage: 1.25, disadvantage: 0.8, ramHullMin: 50, outgunnedRatio: 1.5 },
    ...(battle ? { battle } : {}),
  }
}

function gameConfig(p1Troops: TroopStack[], battle: BattleTuning | null): GameConfig {
  return {
    seed: 7,
    mapSize: 'small',
    setup: {
      startingGold: 1000,
      startingCaptainMovement: 5,
      startingShipClass: 'sloop',
      homeIslandRadius: 2,
      startingBuildings: ['townhall'],
      cityVisionRadius: 3,
      captainVisionRadius: 2,
      combatWinXp: 40,
      startingReputation: 100,
      betrayalReputationPenalty: 40,
      allianceReputationMin: 30,
    },
    players: [
      { id: 'p1', name: 'P1', faction: 'pirates', isAI: false, startingTroops: p1Troops },
      {
        id: 'p2',
        name: 'P2',
        faction: 'british',
        isAI: true,
        startingTroops: [{ unitId: 'grunt', count: 10 }],
      },
    ],
    combatStats: statsData(battle),
  }
}

/** A fresh game with the two captains adjacent, ready for an attackCaptain action. */
function adjacentBattleState(
  p1Troops: TroopStack[] = [{ unitId: 'grunt', count: 12 }],
  battle: BattleTuning | null = BATTLE_TUNING,
): GameState {
  const state = createGame(gameConfig(p1Troops, battle))
  const p1cap = captainsOf(state, 'p1')[0]!
  const p2cap = captainsOf(state, 'p2')[0]!
  const target = { x: p1cap.position.x + 1, y: p1cap.position.y }
  return {
    ...state,
    captains: state.captains.map((c) => (c.id === p2cap.id ? { ...c, position: target } : c)),
  }
}

function attackAction(state: GameState) {
  return {
    captainId: captainsOf(state, 'p1')[0]!.id,
    targetCaptainId: captainsOf(state, 'p2')[0]!.id,
    // Grapple on round one so every test deterministically reaches the melee.
    attackerOrders: ['board' as const],
  }
}

/** The sheet's own decision path: engage the first target planAttack accepts, else advance, else hold. */
function scriptedCommand(view: BoardActivationView): BoardCommand {
  for (const t of view.targets) {
    const plan = planAttack(view, t.targetId)
    if (plan) return plan.command
  }
  const march = view.targets[0]?.approachHex
  return march ? { stackId: view.stack.id, to: march } : { stackId: view.stack.id }
}

/** Drive the probe to resolution, returning the recorded plan, the final probe, and every awaited view. */
function playOut(state: GameState) {
  const action = attackAction(state)
  const commands: BoardCommand[] = []
  const views: BoardActivationView[] = []
  let probe = probeBoardingBattle(state, action, commands)
  let guard = 0
  while (probe.kind === 'awaitingCommand') {
    if (++guard > 500) throw new Error('boarding melee did not resolve')
    views.push(probe.view)
    commands.push(scriptedCommand(probe.view))
    probe = probeBoardingBattle(state, action, commands)
  }
  return { action, commands, views, report: probe.report }
}

describe('probeBoardingBattle', () => {
  it('halts at the first attacker activation with the engine-computed view', () => {
    const state = adjacentBattleState()
    const probe = probeBoardingBattle(state, attackAction(state), [])
    expect(probe.kind).toBe('awaitingCommand')
    if (probe.kind !== 'awaitingCommand') return
    expect(probe.view.stack.side).toBe('attacker')
    expect(probe.view.reachable.length).toBeGreaterThan(0)
    expect(probe.view.enemies.length).toBeGreaterThan(0)
  })

  it('is deterministic: the same commands always probe to the same pending activation', () => {
    const state = adjacentBattleState()
    const a = probeBoardingBattle(state, attackAction(state), [])
    const b = probeBoardingBattle(state, attackAction(state), [])
    expect(JSON.stringify(a)).toBe(JSON.stringify(b))
  })

  it('resolves without ever awaiting when the stats snapshot has no battle tuning', () => {
    const state = adjacentBattleState([{ unitId: 'grunt', count: 12 }], null)
    const probe = probeBoardingBattle(state, attackAction(state), [])
    expect(probe.kind).toBe('resolved')
    if (probe.kind !== 'resolved') return
    expect(probe.report.board).toBeUndefined()
  })

  it('a recorded plan replays bit-identically through the reducer — the boardCommands contract', () => {
    const state = adjacentBattleState()
    const { action, commands, report } = playOut(state)
    expect(commands.length).toBeGreaterThan(0)
    // Structural shape the reducer validates: plain non-negative integers only.
    for (const c of commands) {
      expect(Number.isInteger(c.stackId)).toBe(true)
      if (c.to) expect(Number.isInteger(c.to.col) && Number.isInteger(c.to.row)).toBe(true)
      if (c.targetId !== undefined) expect(Number.isInteger(c.targetId)).toBe(true)
    }
    const { battleReport } = applyActionWithOutcome(state, {
      type: 'attackCaptain',
      playerId: 'p1',
      ...action,
      boardCommands: commands,
    })
    expect(battleReport?.board).toBeDefined()
    expect(JSON.stringify(battleReport)).toBe(JSON.stringify(report))
  })

  it('mirrors the reducer on the real UI path — no attacker orders, AI-driven naval rounds', () => {
    const state = adjacentBattleState()
    // Exactly what GameScreen sends: no attackerOrders, boardCommands only when recorded.
    const action = {
      captainId: captainsOf(state, 'p1')[0]!.id,
      targetCaptainId: captainsOf(state, 'p2')[0]!.id,
    }
    const commands: BoardCommand[] = []
    let probe = probeBoardingBattle(state, action, commands)
    let guard = 0
    while (probe.kind === 'awaitingCommand') {
      if (++guard > 500) throw new Error('boarding melee did not resolve')
      commands.push(scriptedCommand(probe.view))
      probe = probeBoardingBattle(state, action, commands)
    }
    const { battleReport } = applyActionWithOutcome(state, {
      type: 'attackCaptain',
      playerId: 'p1',
      ...action,
      ...(commands.length > 0 ? { boardCommands: commands } : {}),
    })
    expect(JSON.stringify(battleReport)).toBe(JSON.stringify(probe.report))
  })

  it('a ranged crew records shots that replay identically too (#94)', () => {
    const state = adjacentBattleState([{ unitId: 'archer', count: 12 }])
    const { action, commands, report } = playOut(state)
    const { battleReport } = applyActionWithOutcome(state, {
      type: 'attackCaptain',
      playerId: 'p1',
      ...action,
      boardCommands: commands,
    })
    expect(JSON.stringify(battleReport)).toBe(JSON.stringify(report))
    expect(report.board!.events.some((e) => e.type === 'attack' && e.ranged)).toBe(true)
  })
})

describe('planMove / planAttack', () => {
  it('planMove accepts exactly the engine-reachable hexes', () => {
    const state = adjacentBattleState()
    const probe = probeBoardingBattle(state, attackAction(state), [])
    if (probe.kind !== 'awaitingCommand') throw new Error('expected a pending activation')
    const view = probe.view
    const first = view.reachable[0]!
    expect(planMove(view, first.hex)).toEqual({
      command: { stackId: view.stack.id, to: first.hex },
      cost: first.cost,
      terrain: view.terrain[first.hex.row * view.width + first.hex.col],
    })
    expect(planMove(view, { col: 99, row: 99 })).toBeNull()
    expect(planMove(view, view.stack.position)).toBeNull()
  })

  it('planAttack builds the exact command the engine expects for an engageable target', () => {
    const state = adjacentBattleState()
    // Walk the fight forward until a melee-engageable target shows up.
    const { views } = playOut(state)
    const view = views.find((v) => v.targets.some((t) => t.attackFrom !== undefined))
    expect(view).toBeDefined()
    const option = view!.targets.find((t) => t.attackFrom !== undefined)!
    const plan = planAttack(view!, option.targetId)
    expect(plan).not.toBeNull()
    expect(plan!.mode).toBe('melee')
    expect(plan!.command).toEqual({
      stackId: view!.stack.id,
      ...(option.attackFrom ? { to: option.attackFrom } : {}),
      targetId: option.targetId,
    })
  })

  it('planAttack honors a player-chosen strike hex and rejects one out of reach', () => {
    const state = adjacentBattleState()
    const { views } = playOut(state)
    // Find an activation where some reachable hex stands beside an enemy —
    // the tap-hex-then-tap-enemy "strike from here" path.
    let found: {
      view: BoardActivationView
      targetId: number
      from: { col: number; row: number }
    } | null = null
    for (const view of views) {
      for (const enemy of view.enemies) {
        const from = view.reachable.find((r) => hexDistance(r.hex, enemy.position) === 1)
        if (from) {
          found = { view, targetId: enemy.id, from: from.hex }
          break
        }
      }
      if (found) break
    }
    expect(found).not.toBeNull()
    const plan = planAttack(found!.view, found!.targetId, found!.from)
    expect(plan?.mode).toBe('melee')
    expect(plan?.command).toEqual({
      stackId: found!.view.stack.id,
      to: found!.from,
      targetId: found!.targetId,
    })
    expect(planAttack(found!.view, found!.targetId, { col: 99, row: 99 })).toBeNull()
  })

  it('planAttack returns null for a target that cannot be engaged this activation', () => {
    const state = adjacentBattleState()
    const probe = probeBoardingBattle(state, attackAction(state), [])
    if (probe.kind !== 'awaitingCommand') throw new Error('expected a pending activation')
    // Deployment puts the sides ten columns apart with speed 5: round one has
    // no engageable target, so the first view exercises the null path.
    const view = probe.view
    for (const t of view.targets) {
      if (t.attackFrom === undefined && t.rangedFrom === undefined) {
        expect(planAttack(view, t.targetId)).toBeNull()
      }
    }
    expect(planAttack(view, 9999)).toBeNull()
  })
})

describe('stackLosses', () => {
  const stack = (id: number, side: 'attacker' | 'defender', count: number): BoardStack => ({
    id,
    side,
    unitId: 'grunt',
    count,
    topHp: 12,
    position: { col: 0, row: id },
    retaliatedRound: 0,
    holding: false,
  })

  it('reports every stack that lost units, with wiped stacks at zero', () => {
    const prev = {
      stack: stack(0, 'attacker' as const, 12),
      allies: [stack(1, 'attacker' as const, 5)],
      enemies: [stack(2, 'defender' as const, 10)],
    }
    const next = {
      stack: stack(1, 'attacker' as const, 5),
      allies: [stack(0, 'attacker' as const, 9)],
      enemies: [],
    }
    expect(stackLosses(prev, next)).toEqual([
      { side: 'attacker', unitId: 'grunt', before: 12, after: 9 },
      { side: 'defender', unitId: 'grunt', before: 10, after: 0 },
    ])
  })

  it('is empty when nothing changed', () => {
    const v = {
      stack: stack(0, 'attacker' as const, 12),
      allies: [],
      enemies: [stack(1, 'defender' as const, 10)],
    }
    expect(stackLosses(v, v)).toEqual([])
  })
})
