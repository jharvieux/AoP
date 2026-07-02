import { describe, expect, it } from 'vitest'
import {
  captainsOf,
  createGame,
  currentPlayer,
  nextAiAction,
  runAiTurn,
  type CombatStatsData,
  type GameConfig,
  type GameState,
} from '../src'

const STATS: CombatStatsData = {
  units: [
    { id: 'grunt', attack: 5, defense: 2, health: 12 },
    { id: 'elite', attack: 12, defense: 8, health: 40 },
  ],
  ships: [{ id: 'sloop', hull: 40, cannons: 6 }],
}

function config(p1Troops: number, p2Troops: number, unit = 'grunt'): GameConfig {
  return {
    seed: 3,
    mapSize: 'medium',
    players: [
      {
        id: 'p1',
        name: 'P1',
        faction: 'pirates',
        isAI: true,
        startingTroops: [{ unitId: unit, count: p1Troops }],
      },
      {
        id: 'p2',
        name: 'P2',
        faction: 'british',
        isAI: true,
        startingTroops: [{ unitId: unit, count: p2Troops }],
      },
    ],
    combatStats: STATS,
  }
}

function placeAdjacent(state: GameState): GameState {
  const p1 = captainsOf(state, 'p1')[0]!
  const p2 = captainsOf(state, 'p2')[0]!
  const spot = { x: p1.position.x + 1, y: p1.position.y }
  return {
    ...state,
    captains: state.captains.map((c) => (c.id === p2.id ? { ...c, position: spot } : c)),
  }
}

describe('nextAiAction', () => {
  it('is deterministic', () => {
    const state = createGame(config(5, 3))
    expect(nextAiAction(state, 'p1')).toEqual(nextAiAction(state, 'p1'))
  })

  it('attacks an adjacent, beatable enemy', () => {
    const state = placeAdjacent(createGame(config(8, 1)))
    const action = nextAiAction(state, 'p1')
    expect(action.type).toBe('attackCaptain')
  })

  it('advances on a beatable but distant enemy', () => {
    const state = createGame(config(8, 1))
    const action = nextAiAction(state, 'p1')
    expect(action.type).toBe('moveCaptain')
  })

  it('holds (ends turn) rather than charge a stronger enemy', () => {
    const state = createGame(config(1, 8))
    const action = nextAiAction(state, 'p1')
    expect(action.type).toBe('endTurn')
  })

  it('does not attack an adjacent stronger enemy', () => {
    const state = placeAdjacent(createGame(config(1, 8)))
    const action = nextAiAction(state, 'p1')
    expect(action.type).not.toBe('attackCaptain')
  })
})

describe('runAiTurn', () => {
  it('terminates and hands the turn on', () => {
    const state = createGame(config(5, 5))
    const next = runAiTurn(state, 'p1')
    // Either the game ended or it is no longer p1's turn.
    expect(next.status === 'finished' || currentPlayer(next).id !== 'p1').toBe(true)
    expect(next.actionCount).toBeGreaterThan(0)
  })

  it('is deterministic across identical runs', () => {
    const a = runAiTurn(createGame(config(5, 5)), 'p1')
    const b = runAiTurn(createGame(config(5, 5)), 'p1')
    expect(JSON.stringify(a)).toBe(JSON.stringify(b))
  })
})
