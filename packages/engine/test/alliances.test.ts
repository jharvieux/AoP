import { describe, expect, it } from 'vitest'
import {
  applyAction,
  areAllied,
  createGame,
  InvalidActionError,
  replay,
  type Action,
  type GameConfig,
} from '../src'
import { GAME_SETUP } from './fixtures'

/** A bare N-player config; `teams` seeds the opening alliance graph (#136). */
function allianceConfig(playerCount = 3, teams: Record<string, string> = {}): GameConfig {
  const factions = ['pirates', 'british', 'spanish', 'dutch'] as const
  return {
    seed: 11,
    mapSize: 'small',
    setup: GAME_SETUP,
    players: Array.from({ length: playerCount }, (_, i) => {
      const id = `p${i + 1}`
      return {
        id,
        name: `P${i + 1}`,
        faction: factions[i % factions.length]!,
        isAI: false,
        ...(teams[id] ? { team: teams[id] } : {}),
      }
    }),
  }
}

describe('alliance seeding from team (#136)', () => {
  it('starts same-team players mutually allied and different-team players unallied', () => {
    const state = createGame(allianceConfig(3, { p1: 'north', p2: 'north' }))
    expect(areAllied(state, 'p1', 'p2')).toBe(true)
    expect(areAllied(state, 'p1', 'p3')).toBe(false)
    expect(state.alliances.pairs).toHaveLength(1)
    expect(state.alliances.proposals).toEqual([])
  })

  it('seeds every pair within a shared team (pairwise, one entry per pair)', () => {
    const state = createGame(allianceConfig(3, { p1: 'north', p2: 'north', p3: 'north' }))
    expect(areAllied(state, 'p1', 'p2')).toBe(true)
    expect(areAllied(state, 'p2', 'p3')).toBe(true)
    expect(areAllied(state, 'p1', 'p3')).toBe(true)
    expect(state.alliances.pairs).toHaveLength(3)
  })

  it('starts with no alliances when no team is set', () => {
    const state = createGame(allianceConfig(3))
    expect(state.alliances.pairs).toEqual([])
    expect(areAllied(state, 'p1', 'p2')).toBe(false)
  })

  it('never treats a seat as allied with itself', () => {
    const state = createGame(allianceConfig(2, { p1: 'north', p2: 'north' }))
    expect(areAllied(state, 'p1', 'p1')).toBe(false)
  })
})

describe('alliance lifecycle actions (#136)', () => {
  it('forms a mutual alliance via propose-then-accept across two turns', () => {
    let state = createGame(allianceConfig(3))
    state = applyAction(state, { type: 'proposeAlliance', playerId: 'p1', targetId: 'p2' })
    // A proposal is not yet an alliance.
    expect(areAllied(state, 'p1', 'p2')).toBe(false)
    expect(state.alliances.proposals).toEqual([{ from: 'p1', to: 'p2' }])

    state = applyAction(state, { type: 'endTurn', playerId: 'p1' })
    state = applyAction(state, { type: 'acceptAlliance', playerId: 'p2', proposerId: 'p1' })
    expect(areAllied(state, 'p1', 'p2')).toBe(true)
    expect(state.alliances.proposals).toEqual([])
    expect(state.alliances.pairs).toHaveLength(1)
  })

  it('rejects an accept with no matching proposal (accept-with-no-propose is never valid)', () => {
    const state = createGame(allianceConfig(3))
    expect(() =>
      applyAction(state, { type: 'acceptAlliance', playerId: 'p1', proposerId: 'p2' }),
    ).toThrow(InvalidActionError)
  })

  it('does not let the proposer accept their own proposal', () => {
    let state = createGame(allianceConfig(3))
    state = applyAction(state, { type: 'proposeAlliance', playerId: 'p1', targetId: 'p2' })
    // Still p1's turn; p1 cannot self-accept the offer it made to p2.
    expect(() =>
      applyAction(state, { type: 'acceptAlliance', playerId: 'p1', proposerId: 'p1' }),
    ).toThrow(InvalidActionError)
  })

  it('rejects proposing to yourself', () => {
    const state = createGame(allianceConfig(3))
    expect(() =>
      applyAction(state, { type: 'proposeAlliance', playerId: 'p1', targetId: 'p1' }),
    ).toThrow(InvalidActionError)
  })

  it('rejects a proposal to an already-allied seat', () => {
    const state = createGame(allianceConfig(2, { p1: 'north', p2: 'north' }))
    expect(() =>
      applyAction(state, { type: 'proposeAlliance', playerId: 'p1', targetId: 'p2' }),
    ).toThrow(InvalidActionError)
  })

  it('rejects a duplicate proposal in either direction', () => {
    let state = createGame(allianceConfig(3))
    state = applyAction(state, { type: 'proposeAlliance', playerId: 'p1', targetId: 'p2' })
    // Same-direction duplicate on the same turn.
    expect(() =>
      applyAction(state, { type: 'proposeAlliance', playerId: 'p1', targetId: 'p2' }),
    ).toThrow(InvalidActionError)
    // Reverse-direction while p1's offer stands: p2 must accept, not counter-propose.
    state = applyAction(state, { type: 'endTurn', playerId: 'p1' })
    expect(() =>
      applyAction(state, { type: 'proposeAlliance', playerId: 'p2', targetId: 'p1' }),
    ).toThrow(InvalidActionError)
  })

  it('rejects proposing to an eliminated seat', () => {
    let state = createGame(allianceConfig(3))
    // p2 resigns on its turn, then play comes back to p1.
    state = applyAction(state, { type: 'endTurn', playerId: 'p1' })
    state = applyAction(state, { type: 'resign', playerId: 'p2' })
    state = applyAction(state, { type: 'endTurn', playerId: 'p3' })
    expect(() =>
      applyAction(state, { type: 'proposeAlliance', playerId: 'p1', targetId: 'p2' }),
    ).toThrow(InvalidActionError)
  })

  it('breaks an alliance with leaveAlliance and rejects leaving one you are not in', () => {
    const state = createGame(allianceConfig(2, { p1: 'north', p2: 'north' }))
    const broken = applyAction(state, { type: 'leaveAlliance', playerId: 'p1', otherId: 'p2' })
    expect(areAllied(broken, 'p1', 'p2')).toBe(false)
    expect(broken.alliances.pairs).toEqual([])
    // No alliance to leave now.
    expect(() =>
      applyAction(broken, { type: 'leaveAlliance', playerId: 'p1', otherId: 'p2' }),
    ).toThrow(InvalidActionError)
  })

  it('enforces turn-ordered consent: a seat can only act on the graph on its own turn', () => {
    const state = createGame(allianceConfig(3))
    // It is p1's turn; p2 cannot propose out of turn.
    expect(() =>
      applyAction(state, { type: 'proposeAlliance', playerId: 'p2', targetId: 'p3' }),
    ).toThrow(InvalidActionError)
  })
})

describe('alliance cleanup on elimination (#136)', () => {
  it('drops a resigning seat’s alliances and proposals', () => {
    let state = createGame(allianceConfig(3, { p1: 'north', p2: 'north' }))
    // p1 proposes to p3 as well, so p1 holds a pending proposal at resign time.
    state = applyAction(state, { type: 'proposeAlliance', playerId: 'p1', targetId: 'p3' })
    expect(state.alliances.pairs).toHaveLength(1)
    expect(state.alliances.proposals).toHaveLength(1)

    state = applyAction(state, { type: 'resign', playerId: 'p1' })
    // p1 is gone: its p2 alliance and its p3 proposal are both pruned.
    expect(state.alliances.pairs).toEqual([])
    expect(state.alliances.proposals).toEqual([])
    expect(areAllied(state, 'p1', 'p2')).toBe(false)
  })
})

describe('alliance replay determinism (#136)', () => {
  it('replays a propose/accept/leave log to an identical state', () => {
    const log: Action[] = [
      { type: 'proposeAlliance', playerId: 'p1', targetId: 'p2' },
      { type: 'endTurn', playerId: 'p1' },
      { type: 'acceptAlliance', playerId: 'p2', proposerId: 'p1' },
      { type: 'proposeAlliance', playerId: 'p2', targetId: 'p3' },
      { type: 'endTurn', playerId: 'p2' },
      { type: 'acceptAlliance', playerId: 'p3', proposerId: 'p2' },
      { type: 'endTurn', playerId: 'p3' },
      { type: 'leaveAlliance', playerId: 'p1', otherId: 'p2' },
      { type: 'endTurn', playerId: 'p1' },
    ]
    const a = replay(createGame(allianceConfig(3)), log)
    const b = replay(createGame(allianceConfig(3)), log)
    expect(JSON.stringify(a)).toBe(JSON.stringify(b))
    expect(a.actionCount).toBe(log.length)
    // Final graph: p2–p3 stands; p1–p2 was formed then left.
    expect(areAllied(a, 'p2', 'p3')).toBe(true)
    expect(areAllied(a, 'p1', 'p2')).toBe(false)
  })

  it('replays alliance-seeded games identically', () => {
    const cfg = allianceConfig(3, { p1: 'north', p3: 'north' })
    expect(JSON.stringify(createGame(cfg))).toBe(JSON.stringify(createGame(cfg)))
  })
})
