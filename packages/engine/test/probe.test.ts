import { describe, expect, it } from 'vitest'
import {
  applyActionWithOutcome,
  captainsOf,
  createGame,
  probeBoardingBattle,
  probeTacticalBattle,
  type BoardActivationView,
  type BoardCommand,
  type CombatStatsData,
  type GameConfig,
  type GameState,
  type TacticId,
  type TroopStack,
} from '../src'
import { BATTLE_TUNING, COMBAT_TUNING, GAME_SETUP, TACTICS_TUNING } from './fixtures'

/**
 * The interactive-combat probes (#93, #305) live in the engine so single-player
 * and the multiplayer server run the identical pure simulation
 * (docs/design/multiplayer-tactical-probe.md). Their load-bearing property is
 * monotone determinism: re-probing with any prefix of a recorded order list
 * reproduces the exact decision context that prefix produced the first time,
 * regardless of when — or in what order — the probes are evaluated. The server
 * design leans on this to disclose one round of context per committed order
 * without ever replaying differently. These tests pin that property directly.
 */

const UNITS = [
  { id: 'grunt', attack: 5, defense: 2, health: 12, speed: 5 },
  { id: 'archer', attack: 4, defense: 1, health: 8, speed: 6, range: 3 },
]
const SHIPS = [{ id: 'sloop', hull: 40, cannons: 6, speed: 5 }]

function statsData(battle: typeof BATTLE_TUNING | null): CombatStatsData {
  return {
    units: UNITS,
    ships: SHIPS,
    combat: COMBAT_TUNING,
    tactics: TACTICS_TUNING,
    ...(battle ? { battle } : {}),
  }
}

function gameConfig(battle: typeof BATTLE_TUNING | null): GameConfig {
  const p1Troops: TroopStack[] = [{ unitId: 'grunt', count: 12 }]
  return {
    seed: 7,
    mapSize: 'small',
    setup: GAME_SETUP,
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
function adjacentBattleState(battle: typeof BATTLE_TUNING | null = BATTLE_TUNING): GameState {
  const state = createGame(gameConfig(battle))
  const p1cap = captainsOf(state, 'p1')[0]!
  const p2cap = captainsOf(state, 'p2')[0]!
  const target = { x: p1cap.position.x + 1, y: p1cap.position.y }
  return {
    ...state,
    captains: state.captains.map((c) => (c.id === p2cap.id ? { ...c, position: target } : c)),
  }
}

function attackTargets(state: GameState) {
  return {
    captainId: captainsOf(state, 'p1')[0]!.id,
    targetCaptainId: captainsOf(state, 'p2')[0]!.id,
  }
}

/** A deterministic legal board command from an activation view (mirrors the engine's own boardAiDriver choice). */
function scriptedCommand(view: BoardActivationView): BoardCommand {
  for (const t of view.targets) {
    if (t.rangedFrom !== undefined || t.attackFrom !== undefined) {
      const from = t.rangedFrom ?? t.attackFrom
      return { stackId: view.stack.id, ...(from ? { to: from } : {}), targetId: t.targetId }
    }
  }
  const march = view.targets[0]?.approachHex
  return march ? { stackId: view.stack.id, to: march } : { stackId: view.stack.id }
}

/**
 * Re-probe with every prefix of `orders` in a deliberately non-sequential order
 * — reversed, then evens, then odds — and assert each matches the canonical
 * outcome that prefix produced when the plan was recorded left to right. If any
 * probe carried hidden state across calls, or replayed a prefix differently, an
 * interleaved evaluation order would surface it.
 */
function assertInterleavedPrefixes<T>(
  n: number,
  canonical: readonly T[],
  probeAt: (k: number) => T,
): void {
  const order: number[] = []
  for (let k = n; k >= 0; k--) order.push(k)
  for (let k = 0; k <= n; k += 2) order.push(k)
  for (let k = 1; k <= n; k += 2) order.push(k)
  for (const k of order) {
    expect(JSON.stringify(probeAt(k))).toBe(JSON.stringify(canonical[k]))
  }
}

describe('probe determinism: interleaved growing prefixes replay bit-exact', () => {
  it('naval-tactics probe: every tactic prefix reproduces its recorded round context', () => {
    const state = adjacentBattleState(null) // no board tuning: pure gunnery, a clean growing prefix
    const action = attackTargets(state)
    const orders: TacticId[] = []
    const canonical = [probeTacticalBattle(state, action, [], [])]
    let guard = 0
    while (canonical[canonical.length - 1]!.kind === 'awaitingTactic') {
      if (++guard > 100) throw new Error('gunnery duel did not resolve')
      const ctx = (canonical[canonical.length - 1] as { ctx: { available: TacticId[] } }).ctx
      orders.push(ctx.available.includes('broadside') ? 'broadside' : ctx.available[0]!)
      canonical.push(probeTacticalBattle(state, action, orders, []))
    }
    const n = orders.length
    expect(n).toBeGreaterThan(1) // more than one round fought — a non-trivial prefix chain
    expect(canonical[n]!.kind).toBe('resolved')

    assertInterleavedPrefixes(n, canonical, (k) =>
      probeTacticalBattle(state, action, orders.slice(0, k), []),
    )

    // The recorded plan is the authority contract: it replays bit-identically
    // through the reducer as attackerOrders.
    const { battleReport } = applyActionWithOutcome(state, {
      type: 'attackCaptain',
      playerId: 'p1',
      ...action,
      attackerOrders: orders,
    })
    const resolved = canonical[n] as { report: unknown }
    expect(JSON.stringify(battleReport)).toBe(JSON.stringify(resolved.report))
  })

  it('boarding probe: every command prefix reproduces its recorded activation view', () => {
    const state = adjacentBattleState()
    const action = { ...attackTargets(state), attackerOrders: ['board' as const] }
    const commands: BoardCommand[] = []
    const canonical = [probeBoardingBattle(state, action, [])]
    let guard = 0
    while (canonical[canonical.length - 1]!.kind === 'awaitingCommand') {
      if (++guard > 500) throw new Error('boarding melee did not resolve')
      const view = (canonical[canonical.length - 1] as { view: BoardActivationView }).view
      commands.push(scriptedCommand(view))
      canonical.push(probeBoardingBattle(state, action, commands))
    }
    const n = commands.length
    expect(n).toBeGreaterThan(1)
    expect(canonical[n]!.kind).toBe('resolved')

    assertInterleavedPrefixes(n, canonical, (k) =>
      probeBoardingBattle(state, action, commands.slice(0, k)),
    )

    const { battleReport } = applyActionWithOutcome(state, {
      type: 'attackCaptain',
      playerId: 'p1',
      ...action,
      boardCommands: commands,
    })
    const resolved = canonical[n] as { report: unknown }
    expect(JSON.stringify(battleReport)).toBe(JSON.stringify(resolved.report))
  })
})
