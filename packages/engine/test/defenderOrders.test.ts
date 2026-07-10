import { describe, expect, it } from 'vitest'
import {
  applyAction,
  applyActionWithOutcome,
  captainsOf,
  createGame,
  playerView,
  probeTacticalBattle,
  replay,
  type Action,
  type AttackCaptainAction,
  type CombatStatsData,
  type GameConfig,
  type GameState,
  type StandingOrder,
  type TacticId,
} from '../src'
import { BATTLE_TUNING, COMBAT_TUNING, GAME_SETUP, TACTICS_TUNING } from './fixtures'

/**
 * Server-authored interactive-defender orders (#418, #410, D-029). The
 * `attackCaptain` action gained optional `defenderOrders`/`defenderBoardCommands`
 * so a multiplayer battle-session resolver can carry the defender's OWN recorded
 * picks into the one logged action, keeping the replay contract intact while
 * letting an interactive defender's tactics actually influence the fight. These
 * tests pin the four properties that make that real:
 *
 *   1. Absent the fields, resolution is byte-identical to today (single-player and
 *      standing-orders multiplayer are untouched).
 *   2. Present, the recorded picks drive the defender and change the outcome.
 *   3. Probe parity: the engine probe wired with the same defender picks resolves
 *      to a battle report bit-identical to the reducer's applied report — the
 *      "server probe == final applied report" guarantee #408 builds on.
 *   4. Replay/snapshot-resume of the populated action is exact, and the recorded
 *      picks never leak into a PlayerView.
 */

const UNITS = [{ id: 'grunt', attack: 5, defense: 2, health: 12, speed: 5 }]
const SHIPS = [{ id: 'sloop', hull: 40, cannons: 6, speed: 5 }]

function statsData(): CombatStatsData {
  return {
    units: UNITS,
    ships: SHIPS,
    combat: COMBAT_TUNING,
    tactics: TACTICS_TUNING,
    battle: BATTLE_TUNING,
  }
}

function gameConfig(): GameConfig {
  return {
    seed: 7,
    mapSize: 'small',
    setup: GAME_SETUP,
    players: [
      {
        id: 'p1',
        name: 'P1',
        faction: 'pirates',
        isAI: false,
        startingTroops: [{ unitId: 'grunt', count: 12 }],
      },
      {
        id: 'p2',
        name: 'P2',
        faction: 'british',
        isAI: false,
        startingTroops: [{ unitId: 'grunt', count: 10 }],
      },
    ],
    combatStats: statsData(),
  }
}

/** Two captains adjacent, the defender optionally carrying standing orders. */
function adjacentState(defenderStandingOrders?: StandingOrder[]): GameState {
  const state = createGame(gameConfig())
  const p1cap = captainsOf(state, 'p1')[0]!
  const p2cap = captainsOf(state, 'p2')[0]!
  const target = { x: p1cap.position.x + 1, y: p1cap.position.y }
  return {
    ...state,
    captains: state.captains.map((c) =>
      c.id === p2cap.id
        ? {
            ...c,
            position: target,
            ...(defenderStandingOrders ? { standingOrders: defenderStandingOrders } : {}),
          }
        : c,
    ),
  }
}

function attackTargets(state: GameState) {
  return {
    captainId: captainsOf(state, 'p1')[0]!.id,
    targetCaptainId: captainsOf(state, 'p2')[0]!.id,
  }
}

/**
 * Drive the attacker interactively through the probe (recording one pick per
 * awaited round) while the defender plays `defenderOrders`, returning the
 * attacker's full recorded plan and the probe's final resolved report.
 */
function driveProbe(
  state: GameState,
  action: ReturnType<typeof attackTargets>,
  defenderOrders: readonly TacticId[],
): { attackerOrders: TacticId[]; report: unknown } {
  const attackerOrders: TacticId[] = []
  let outcome = probeTacticalBattle(state, action, attackerOrders, [], {
    tacticOrders: defenderOrders,
  })
  let guard = 0
  while (outcome.kind === 'awaitingTactic') {
    if (++guard > 200) throw new Error('battle did not resolve')
    const { available } = outcome.ctx
    attackerOrders.push(available.includes('broadside') ? 'broadside' : available[0]!)
    outcome = probeTacticalBattle(state, action, attackerOrders, [], {
      tacticOrders: defenderOrders,
    })
  }
  if (outcome.kind !== 'resolved') throw new Error(`probe ended in board phase (${outcome.kind})`)
  return { attackerOrders, report: outcome.report }
}

/** Recursively assert no object key named `banned` appears anywhere in `value`. */
function assertNoKey(value: unknown, banned: string, path = '$'): void {
  if (value === null || typeof value !== 'object') return
  if (Array.isArray(value)) {
    value.forEach((v, i) => assertNoKey(v, banned, `${path}[${i}]`))
    return
  }
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    if (k === banned) throw new Error(`leaked key '${banned}' at ${path}.${k}`)
    assertNoKey(v, banned, `${path}.${k}`)
  }
}

describe('server-authored defender orders (#418)', () => {
  it('absent defenderOrders, resolution is byte-identical to the standing-orders path', () => {
    const orders: StandingOrder[] = [{ when: 'always', tactic: 'evade' }]
    const state = adjacentState(orders)
    const action: AttackCaptainAction = {
      type: 'attackCaptain',
      playerId: 'p1',
      ...attackTargets(state),
      attackerOrders: ['broadside', 'broadside', 'broadside'],
    }
    // Two applications of the identical field-less action must match, and the
    // report must reflect the defender's standing orders driving (not defenderOrders).
    const a = applyActionWithOutcome(state, action)
    const b = applyActionWithOutcome(state, { ...action })
    expect(JSON.stringify(a.battleReport)).toBe(JSON.stringify(b.battleReport))
    // The defender evaded at least once — its standing orders, not silence.
    expect(a.battleReport!.rounds.some((r) => r.defenderTactic === 'evade')).toBe(true)
  })

  it('present defenderOrders drive the defender and change the outcome vs standing orders', () => {
    // Standing orders say evade; the recorded interactive picks say broadside.
    const state = adjacentState([{ when: 'always', tactic: 'evade' }])
    const base = attackTargets(state)
    const attackerOrders: TacticId[] = ['broadside', 'broadside', 'broadside', 'broadside']
    const defenderOrders: TacticId[] = ['broadside', 'broadside', 'broadside', 'broadside']

    const standingReport = applyActionWithOutcome(state, {
      type: 'attackCaptain',
      playerId: 'p1',
      ...base,
      attackerOrders,
    }).battleReport!
    const interactiveReport = applyActionWithOutcome(state, {
      type: 'attackCaptain',
      playerId: 'p1',
      ...base,
      attackerOrders,
      defenderOrders,
    }).battleReport!

    // Standing orders evade; recorded picks broadside — round 1 differs, so the
    // whole fight diverges. The recorded picks are authoritative over the doctrine.
    expect(standingReport.rounds[0]!.defenderTactic).toBe('evade')
    expect(interactiveReport.rounds[0]!.defenderTactic).toBe('broadside')
    expect(JSON.stringify(interactiveReport)).not.toBe(JSON.stringify(standingReport))
  })

  it('probe parity: probe with defender picks == applied report, bit-for-bit', () => {
    const state = adjacentState([{ when: 'always', tactic: 'evade' }])
    const base = attackTargets(state)
    const defenderOrders: TacticId[] = ['ram', 'broadside', 'ram', 'broadside', 'ram', 'broadside']

    const { attackerOrders, report } = driveProbe(state, base, defenderOrders)
    const { battleReport } = applyActionWithOutcome(state, {
      type: 'attackCaptain',
      playerId: 'p1',
      ...base,
      attackerOrders,
      defenderOrders,
    })
    expect(JSON.stringify(battleReport)).toBe(JSON.stringify(report))
  })

  it('probe parity holds when the defender prefix is short and standing orders finish the tail', () => {
    // Standing orders say evade; the defender's recorded prefix is a single
    // round of broadside, so round 1 is broadside and every later round falls
    // back to the evade doctrine — an asymmetric tail (D-029 §10.5).
    const state = adjacentState([{ when: 'always', tactic: 'evade' }])
    const base = attackTargets(state)
    const defenderOrders: TacticId[] = ['broadside']

    const { attackerOrders, report } = driveProbe(state, base, defenderOrders)
    const { battleReport } = applyActionWithOutcome(state, {
      type: 'attackCaptain',
      playerId: 'p1',
      ...base,
      attackerOrders,
      defenderOrders,
    })
    expect(JSON.stringify(battleReport)).toBe(JSON.stringify(report))
    // The prefix was consumed (round 1 = recorded broadside), then the tail
    // handed off to the evade standing orders — proof both halves ran.
    expect(battleReport!.rounds[0]!.defenderTactic).toBe('broadside')
    expect(battleReport!.rounds.length).toBeGreaterThan(1)
    expect(battleReport!.rounds.slice(1).some((r) => r.defenderTactic === 'evade')).toBe(true)
  })

  it('replays and snapshot-resumes exactly with the populated action, without leaking the picks', () => {
    const state = adjacentState([{ when: 'always', tactic: 'evade' }])
    const base = attackTargets(state)
    const action: Action = {
      type: 'attackCaptain',
      playerId: 'p1',
      ...base,
      attackerOrders: ['broadside', 'broadside', 'broadside'],
      defenderOrders: ['broadside', 'ram', 'broadside'],
    }
    const log: Action[] = [action]

    const applied = applyAction(state, action)
    // Replay the log from scratch, and resume from a JSON-round-tripped snapshot
    // at every prefix — both must equal a direct apply, byte for byte.
    expect(JSON.stringify(replay(state, log))).toBe(JSON.stringify(applied))
    const snapshot = JSON.parse(JSON.stringify(state)) as GameState
    expect(JSON.stringify(replay(snapshot, log))).toBe(JSON.stringify(applied))

    // The recorded picks ride the action only — never persisted into GameState,
    // never surfaced in either seat's PlayerView (beyond the disclosed battle report).
    for (const key of ['defenderOrders', 'defenderBoardCommands']) {
      assertNoKey(applied, key)
      assertNoKey(playerView(applied, 'p1'), key)
      assertNoKey(playerView(applied, 'p2'), key)
    }
    // The attacker's view never carries the defender's standing orders either (§7).
    const attackerView = playerView(applied, 'p1')
    const enemyCaptain = attackerView.captains?.find((c) => c.ownerId === 'p2')
    if (enemyCaptain) expect(enemyCaptain.standingOrders).toBeUndefined()
  })

  it('rejects malformed server-authored defender orders (fail loud)', () => {
    const state = adjacentState()
    const base = attackTargets(state)
    expect(() =>
      applyAction(state, {
        type: 'attackCaptain',
        playerId: 'p1',
        ...base,
        defenderOrders: ['broadside', 'nonsense' as TacticId],
      }),
    ).toThrow(/defender orders/)
  })
})
