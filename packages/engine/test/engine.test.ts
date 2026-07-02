import { describe, expect, it } from 'vitest'
import {
  applyAction,
  createGame,
  currentPlayer,
  InvalidActionError,
  nextFloat,
  nextInt,
  replay,
  seedRng,
  type Action,
  type GameConfig,
} from '../src'
import { GAME_SETUP } from './fixtures'

function testConfig(playerCount = 3): GameConfig {
  const factions = ['pirates', 'british', 'spanish', 'dutch'] as const
  return {
    seed: 42,
    mapSize: 'small',
    setup: GAME_SETUP,
    players: Array.from({ length: playerCount }, (_, i) => ({
      id: `p${i + 1}`,
      name: `Player ${i + 1}`,
      faction: factions[i % factions.length]!,
      isAI: i > 0,
    })),
  }
}

describe('rng', () => {
  it('is deterministic for the same seed', () => {
    let a = seedRng(123)
    let b = seedRng(123)
    for (let i = 0; i < 100; i++) {
      const [na, va] = nextFloat(a)
      const [nb, vb] = nextFloat(b)
      expect(va).toBe(vb)
      a = na
      b = nb
    }
  })

  it('produces different streams for adjacent seeds', () => {
    const [, a] = nextFloat(seedRng(1))
    const [, b] = nextFloat(seedRng(2))
    expect(a).not.toBe(b)
  })

  it('nextInt stays within bounds', () => {
    let state = seedRng(7)
    for (let i = 0; i < 1000; i++) {
      const [next, v] = nextInt(state, 1, 6)
      expect(v).toBeGreaterThanOrEqual(1)
      expect(v).toBeLessThanOrEqual(6)
      state = next
    }
  })
})

describe('createGame', () => {
  it('is deterministic', () => {
    expect(createGame(testConfig())).toEqual(createGame(testConfig()))
  })

  it('rejects fewer than 2 or more than 8 players', () => {
    expect(() => createGame(testConfig(1))).toThrow()
    expect(() => createGame({ ...testConfig(), players: [] })).toThrow()
    const nine = testConfig(4)
    nine.players = Array.from({ length: 9 }, (_, i) => ({ ...nine.players[0]!, id: `p${i}` }))
    expect(() => createGame(nine)).toThrow()
  })

  it('rejects duplicate player ids', () => {
    const config = testConfig(2)
    config.players[1]!.id = config.players[0]!.id
    expect(() => createGame(config)).toThrow()
  })
})

describe('turn loop', () => {
  it('rotates players and increments the round on wrap', () => {
    let state = createGame(testConfig(3))
    expect(state.round).toBe(1)
    expect(currentPlayer(state).id).toBe('p1')

    state = applyAction(state, { type: 'endTurn', playerId: 'p1' })
    expect(currentPlayer(state).id).toBe('p2')
    expect(state.round).toBe(1)

    state = applyAction(state, { type: 'endTurn', playerId: 'p2' })
    state = applyAction(state, { type: 'endTurn', playerId: 'p3' })
    expect(currentPlayer(state).id).toBe('p1')
    expect(state.round).toBe(2)
  })

  it('rejects out-of-turn actions', () => {
    const state = createGame(testConfig(3))
    expect(() => applyAction(state, { type: 'endTurn', playerId: 'p2' })).toThrow(
      InvalidActionError,
    )
  })

  it('skips eliminated players', () => {
    let state = createGame(testConfig(3))
    state = applyAction(state, { type: 'endTurn', playerId: 'p1' })
    state = applyAction(state, { type: 'resign', playerId: 'p2' })
    expect(currentPlayer(state).id).toBe('p3')
    state = applyAction(state, { type: 'endTurn', playerId: 'p3' })
    state = applyAction(state, { type: 'endTurn', playerId: 'p1' })
    expect(currentPlayer(state).id).toBe('p3')
  })

  it('finishes the game when one player remains', () => {
    let state = createGame(testConfig(3))
    state = applyAction(state, { type: 'resign', playerId: 'p1' })
    expect(state.status).toBe('active')
    state = applyAction(state, { type: 'resign', playerId: 'p2' })
    expect(state.status).toBe('finished')
    expect(state.winnerId).toBe('p3')
    expect(() => applyAction(state, { type: 'endTurn', playerId: 'p3' })).toThrow(
      InvalidActionError,
    )
  })

  it('does not mutate the input state', () => {
    const state = createGame(testConfig(3))
    const snapshot = JSON.parse(JSON.stringify(state))
    applyAction(state, { type: 'endTurn', playerId: 'p1' })
    expect(state).toEqual(snapshot)
  })
})

describe('replay determinism', () => {
  it('replaying the same log yields an identical state', () => {
    const log: Action[] = [
      { type: 'endTurn', playerId: 'p1' },
      { type: 'endTurn', playerId: 'p2' },
      { type: 'resign', playerId: 'p3' },
      { type: 'endTurn', playerId: 'p1' },
      { type: 'endTurn', playerId: 'p2' },
    ]
    const a = replay(createGame(testConfig(3)), log)
    const b = replay(createGame(testConfig(3)), log)
    expect(JSON.stringify(a)).toBe(JSON.stringify(b))
    expect(a.actionCount).toBe(log.length)
  })
})
