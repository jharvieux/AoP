import { describe, expect, it } from 'vitest'
import {
  applyAction,
  createGame,
  InvalidActionError,
  playerView,
  replay,
  type Action,
  type GameConfig,
  type GameState,
} from '../src'
import { GAME_SETUP } from './fixtures'

/**
 * Round cap (#508): `GameSetup.roundLimit` is the last round played — when the
 * counter would advance past it, the match ends where existing win conditions
 * are checked (the round boundary in `advanceTurn`), so a capped log replays to
 * the exact state it finished in live. Absent means unlimited: the pre-#508
 * behavior, byte-for-byte.
 */

function testConfig(roundLimit?: number, playerCount = 2): GameConfig {
  const factions = ['pirates', 'british', 'spanish'] as const
  return {
    seed: 42,
    mapSize: 'small',
    setup: { ...GAME_SETUP, ...(roundLimit !== undefined ? { roundLimit } : {}) },
    players: Array.from({ length: playerCount }, (_, i) => ({
      id: `p${i + 1}`,
      name: `Player ${i + 1}`,
      faction: factions[i % factions.length]!,
      isAI: i > 0,
    })),
  }
}

const endTurn = (playerId: string): Action => ({ type: 'endTurn', playerId })

/** Full rounds of endTurns for a fresh (nobody-eliminated) game. */
function playRounds(state: GameState, rounds: number): GameState {
  for (let r = 0; r < rounds; r++) {
    for (const p of [...state.players]) state = applyAction(state, endTurn(p.id))
  }
  return state
}

describe('roundLimit', () => {
  it('ends the match at the round boundary once the last round has been played', () => {
    let state = createGame(testConfig(2))
    state = playRounds(state, 1)
    expect(state.round).toBe(2)
    expect(state.status).toBe('active')

    // Round 2 is the last round: the final endTurn ends the match instead of
    // starting round 3 — no income is collected and no seat pointer moves.
    state = applyAction(state, endTurn('p1'))
    const beforeCap = state
    state = applyAction(state, endTurn('p2'))
    expect(state.status).toBe('finished')
    expect(state.round).toBe(2)
    expect(state.endedByRoundLimit).toBe(true)
    expect(state.players).toEqual(beforeCap.players)
    expect(() => applyAction(state, endTurn('p1'))).toThrow(InvalidActionError)
  })

  it('is a draw when the living seats tie on cities and gold', () => {
    // A fresh 2-player game is perfectly symmetric: one capital and the
    // starting treasury each, and with no content catalog no income accrues.
    const state = playRounds(createGame(testConfig(1)), 1)
    expect(state.status).toBe('finished')
    expect(state.endedByRoundLimit).toBe(true)
    expect(state.winnerId).toBeNull()
  })

  it('awards the win to the seat holding the most cities', () => {
    let state = createGame(testConfig(1))
    const capital = state.cities.find((c) => c.ownerId === 'p1')!
    state = { ...state, cities: [...state.cities, { ...capital, id: 'extra-city' }] }
    state = playRounds(state, 1)
    expect(state.status).toBe('finished')
    expect(state.winnerId).toBe('p1')
  })

  it('breaks a city tie by gold treasury', () => {
    let state = createGame(testConfig(1))
    state = {
      ...state,
      players: state.players.map((p) =>
        p.id === 'p2' ? { ...p, resources: { ...p.resources, gold: p.resources.gold + 1 } } : p,
      ),
    }
    state = playRounds(state, 1)
    expect(state.status).toBe('finished')
    expect(state.winnerId).toBe('p2')
  })

  it('never fires when the limit is absent, and adds no bytes to the state', () => {
    let state = createGame(testConfig())
    state = playRounds(state, 5)
    expect(state.status).toBe('active')
    expect(state.round).toBe(6)
    // Additivity proof: with no limit set, the serialized state carries neither
    // new key, so a same-seed game is byte-identical to pre-#508 output.
    const json = JSON.stringify(state)
    expect(json).not.toContain('roundLimit')
    expect(json).not.toContain('endedByRoundLimit')
  })

  it('replays a capped log to a byte-identical finished state', () => {
    const initial = createGame(testConfig(2))
    const log: Action[] = [endTurn('p1'), endTurn('p2'), endTurn('p1'), endTurn('p2')]
    const live = log.reduce(applyAction, initial)
    expect(live.status).toBe('finished')
    expect(JSON.stringify(replay(initial, log))).toBe(JSON.stringify(live))
  })

  it('exposes the limit and the cap ending to every seat via playerView', () => {
    const active = createGame(testConfig(2))
    for (const viewer of ['p1', 'p2']) {
      const view = playerView(active, viewer)
      expect(view.rules.setup.roundLimit).toBe(2)
      expect('endedByRoundLimit' in view).toBe(false)
    }
    const finished = playRounds(active, 2)
    for (const viewer of ['p1', 'p2']) {
      const view = playerView(finished, viewer)
      expect(view.status).toBe('finished')
      expect(view.endedByRoundLimit).toBe(true)
    }
  })
})
