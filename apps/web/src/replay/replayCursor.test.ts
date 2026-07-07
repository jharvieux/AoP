import { AI_TUNING, GAME_SETUP, combatStatsData } from '@aop/content'
import {
  applyActionWithOutcome,
  captainsOf,
  createGame,
  type Action,
  type CombatStatsData,
  type GameConfig,
} from '@aop/engine'
import { describe, expect, it } from 'vitest'
import { buildCatalog } from '../catalog'
import { createDefaultPlayer, starterTroops } from '../players'
import {
  actionIndexForRound,
  battleReportAtActionIndex,
  buildReplayCheckpoints,
  stateAtActionIndex,
} from './replayCursor'

function testConfig(): GameConfig {
  const players = [createDefaultPlayer(0), createDefaultPlayer(1)].map((p) => ({
    ...p,
    startingTroops: starterTroops(p.faction),
  }))
  return {
    seed: 42,
    mapSize: 'small',
    players,
    setup: GAME_SETUP,
    combatStats: combatStatsData(),
    content: buildCatalog(),
    aiTuning: AI_TUNING,
  }
}

/** Four rounds of nothing but endTurn: round increments every 2 actions (§reducer
 * advanceTurn wraps back to seat 0). Cheap and fully deterministic to build
 * checkpoints against without depending on map geometry or combat RNG. */
function endTurnLog(rounds: number): Action[] {
  const actions: Action[] = []
  for (let i = 0; i < rounds; i++) {
    actions.push({ type: 'endTurn', playerId: 'player-0' })
    actions.push({ type: 'endTurn', playerId: 'ai-1' })
  }
  return actions
}

describe('buildReplayCheckpoints', () => {
  it('starts with a round-1 checkpoint at action 0', () => {
    const config = testConfig()
    const checkpoints = buildReplayCheckpoints(config, [])
    expect(checkpoints).toHaveLength(1)
    expect(checkpoints[0]).toMatchObject({ actionIndex: 0, round: 1 })
  })

  it('adds one checkpoint per round boundary crossed', () => {
    const config = testConfig()
    const actions = endTurnLog(3)
    const checkpoints = buildReplayCheckpoints(config, actions)
    // round 1 (initial) + rounds 2, 3, 4 reached by the three pairs of endTurns.
    expect(checkpoints.map((c) => c.round)).toEqual([1, 2, 3, 4])
    expect(checkpoints.map((c) => c.actionIndex)).toEqual([0, 2, 4, 6])
  })
})

describe('stateAtActionIndex', () => {
  it('returns the exact checkpoint state when the index lands on one', () => {
    const config = testConfig()
    const actions = endTurnLog(2)
    const checkpoints = buildReplayCheckpoints(config, actions)
    const state = stateAtActionIndex(checkpoints, actions, 2)
    expect(state.round).toBe(2)
  })

  it('replays forward from the nearest preceding checkpoint for indices in between', () => {
    const config = testConfig()
    const actions = endTurnLog(2)
    const checkpoints = buildReplayCheckpoints(config, actions)
    // Index 1 sits between the round-1 and round-2 checkpoints.
    const state = stateAtActionIndex(checkpoints, actions, 1)
    expect(state.round).toBe(1)
    expect(state.currentPlayerIndex).toBe(1)
  })

  it('clamps out-of-range indices to the log bounds', () => {
    const config = testConfig()
    const actions = endTurnLog(1)
    const checkpoints = buildReplayCheckpoints(config, actions)
    expect(stateAtActionIndex(checkpoints, actions, -5).round).toBe(1)
    expect(stateAtActionIndex(checkpoints, actions, 999).round).toBe(2)
  })
})

describe('actionIndexForRound', () => {
  it('jumps to the action index where the requested round begins', () => {
    const config = testConfig()
    const actions = endTurnLog(3)
    const checkpoints = buildReplayCheckpoints(config, actions)
    expect(actionIndexForRound(checkpoints, 1)).toBe(0)
    expect(actionIndexForRound(checkpoints, 3)).toBe(4)
  })

  it('clamps a round beyond the log to the final checkpoint', () => {
    const config = testConfig()
    const actions = endTurnLog(2)
    const checkpoints = buildReplayCheckpoints(config, actions)
    expect(actionIndexForRound(checkpoints, 999)).toBe(
      checkpoints[checkpoints.length - 1]!.actionIndex,
    )
  })
})

/** Test-local combat stats — a rebalance never silently changes what these tests exercise. */
const COMBAT_STATS: CombatStatsData = {
  units: [{ id: 'grunt', attack: 5, defense: 2, health: 12 }],
  ships: [{ id: 'sloop', hull: 40, cannons: 6, speed: 5 }],
  combat: {
    maxRounds: 20,
    damageRollMin: 0.85,
    damageRollSpread: 0.3,
    hullStrengthWeight: 0.25,
    cannonStrengthWeight: 1,
    troopDefenseWeight: 0.5,
    damageScale: 0.35,
  },
  tactics: {
    advantage: 1.25,
    disadvantage: 0.8,
    ramHullMin: 50,
    outgunnedRatio: 1.5,
    aiLosingHpRatio: 0.5,
    aiBoardStrengthRatio: 1.15,
    aggressiveEvadeHpRatio: 0.25,
    cautiousBoardStrengthRatio: 1.4,
  },
}

/** A fresh game with the two captains adjacent, ready for an attackCaptain action (#304). */
function battleConfig(): GameConfig {
  return {
    seed: 7,
    mapSize: 'small',
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
        isAI: true,
        startingTroops: [{ unitId: 'grunt', count: 10 }],
      },
    ],
    setup: GAME_SETUP,
    combatStats: COMBAT_STATS,
  }
}

describe('battleReportAtActionIndex (#304)', () => {
  function adjacentState() {
    const state = createGame(battleConfig())
    const p1cap = captainsOf(state, 'p1')[0]!
    const p2cap = captainsOf(state, 'p2')[0]!
    const target = { x: p1cap.position.x + 1, y: p1cap.position.y }
    return {
      ...state,
      captains: state.captains.map((c) => (c.id === p2cap.id ? { ...c, position: target } : c)),
    }
  }

  it('is null before any action has run', () => {
    const state = adjacentState()
    const checkpoints = buildReplayCheckpoints(battleConfig(), [])
    expect(battleReportAtActionIndex(checkpoints, [], 0)).toBeNull()
    expect(state.round).toBe(1) // sanity: the fixture itself is well-formed
  })

  it('is null when the action just stepped past was not an attackCaptain', () => {
    const checkpoints = [{ actionIndex: 0, round: 1, state: adjacentState() }]
    const actions: Action[] = [{ type: 'endTurn', playerId: 'p1' }]
    expect(battleReportAtActionIndex(checkpoints, actions, 1)).toBeNull()
  })

  it('recovers the exact battle report the live action produced (#304)', () => {
    const state = adjacentState()
    const p1cap = captainsOf(state, 'p1')[0]!
    const p2cap = captainsOf(state, 'p2')[0]!
    const attack: Action = {
      type: 'attackCaptain',
      playerId: 'p1',
      captainId: p1cap.id,
      targetCaptainId: p2cap.id,
    }
    const checkpoints = [{ actionIndex: 0, round: state.round, state }]
    const expected = applyActionWithOutcome(state, attack).battleReport
    expect(expected).toBeDefined()
    expect(battleReportAtActionIndex(checkpoints, [attack], 1)).toEqual(expected)
  })
})
