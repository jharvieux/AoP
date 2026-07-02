import { describe, expect, it } from 'vitest'
import {
  applyAction,
  applyActionWithOutcome,
  captainsOf,
  createGame,
  isWaterTile,
  nextFloat,
  replay,
  resolveEncounterChoice,
  seedRng,
  tileAt,
  InvalidActionError,
  type Action,
  type ContentCatalog,
  type EncounterCatalogLike,
  type GameConfig,
  type GameState,
} from '../src'
import { COMBAT_TUNING, GAME_SETUP, TACTICS_TUNING } from './fixtures'

// Controlled encounter tables: deterministic success (1) / failure (0) branches
// plus a real-looking density so spawning has tiles to work with.
const TEST_ENCOUNTERS: EncounterCatalogLike = {
  merchant: {
    respawnDelay: 2,
    choices: {
      trade: { successChance: 1, cost: { gold: 100 }, reward: { timber: 5 }, xp: 3 },
      rob: { successChance: 0, reward: { gold: 200 }, failTroopLossPct: 0.5, xp: 10 },
    },
  },
  natives: {
    respawnDelay: 4,
    choices: {
      trade: { successChance: 1, cost: { gold: 80 }, reward: { rum: 6 } },
      fight: { successChance: 0, reward: { gold: 150 }, failTroopLossPct: 0.25 },
      quest: { successChance: 1, reward: { gold: 300 }, xp: 20 },
    },
  },
  settlers: {
    respawnDelay: 3,
    choices: {
      recruit: {
        successChance: 1,
        cost: { gold: 150 },
        grantUnitByFaction: { pirates: 'deckhand' },
        grantCount: 6,
        xp: 5,
      },
    },
  },
  spawnDensity: 0.02,
  minStartDistance: 4,
}

const CATALOG: ContentCatalog = {
  buildings: { townhall: { produces: { gold: 100 }, cost: {} } },
  units: {
    deckhand: {
      factionId: 'pirates',
      tier: 1,
      goldCost: 25,
      weeklyGrowth: 8,
      attack: 2,
      defense: 1,
      health: 6,
    },
  },
  ships: { sloop: { hull: 40, cannons: 6, speed: 5, crewCapacity: 4, upgrades: {} } },
  skills: {},
  captainXpThresholds: [0, 150, 400],
  encounters: TEST_ENCOUNTERS,
}

function config(withEncounters = true): GameConfig {
  const { encounters: _drop, ...withoutEncounters } = CATALOG
  const content: ContentCatalog = withEncounters ? CATALOG : withoutEncounters
  return {
    seed: 7,
    mapSize: 'small',
    setup: GAME_SETUP,
    combatStats: {
      units: [{ id: 'deckhand', attack: 2, defense: 1, health: 6 }],
      ships: [{ id: 'sloop', hull: 40, cannons: 6, speed: 5 }],
      combat: COMBAT_TUNING,
      tactics: TACTICS_TUNING,
    },
    content,
    players: [
      { id: 'p1', name: 'One', faction: 'pirates', isAI: false },
      { id: 'p2', name: 'Two', faction: 'british', isAI: true },
    ],
  }
}

/** State with a crafted encounter sitting on p1's captain, and a fixed RNG. */
function stateWithEncounter(
  kind: 'merchant' | 'natives' | 'settlers',
  overrides: Partial<{ troops: { unitId: string; count: number }[]; seed: number }> = {},
): { state: GameState; captainId: string } {
  const base = createGame(config())
  const captain = captainsOf(base, 'p1')[0]!
  const state: GameState = {
    ...base,
    rngState: seedRng(overrides.seed ?? 999),
    captains: base.captains.map((c) =>
      c.id === captain.id ? { ...c, troops: overrides.troops ?? [] } : c,
    ),
    encounters: [
      { id: 'test-enc', kind, position: { ...captain.position }, active: true, respawnRound: null },
    ],
  }
  return { state, captainId: captain.id }
}

describe('encounter spawning', () => {
  it('places encounters on water tiles clear of every start', () => {
    const state = createGame(config())
    expect(state.encounters.length).toBeGreaterThan(0)
    for (const enc of state.encounters) {
      expect(isWaterTile(tileAt(state.map, enc.position))).toBe(true)
      expect(enc.active).toBe(true)
      for (const start of state.map.startPositions) {
        const cheb = Math.max(
          Math.abs(start.x - enc.position.x),
          Math.abs(start.y - enc.position.y),
        )
        expect(cheb).toBeGreaterThanOrEqual(4)
      }
    }
  })

  it('is deterministic for the same config and advances the RNG', () => {
    const a = createGame(config())
    const b = createGame(config())
    expect(a.encounters).toEqual(b.encounters)
    // Spawning consumed the RNG, so state no longer sits at the bare seed.
    expect(a.rngState).not.toBe(seedRng(config().seed))
  })

  it('spawns nothing and leaves the RNG untouched without encounter content', () => {
    const state = createGame(config(false))
    expect(state.encounters).toEqual([])
    expect(state.rngState).toBe(seedRng(config(false).seed))
  })
})

describe('resolveEncounterChoice (pure)', () => {
  it('threads the RNG and honours the success threshold', () => {
    const rng = seedRng(12345)
    const [, roll] = nextFloat(rng)
    const win = resolveEncounterChoice({ successChance: 1 }, 'pirates', [], 10, rng)
    const lose = resolveEncounterChoice({ successChance: 0 }, 'pirates', [], 10, rng)
    expect(win.success).toBe(true)
    expect(lose.success).toBe(false)
    // Both advance the RNG identically (one draw), regardless of outcome.
    expect(win.rng).toBe(lose.rng)
    expect(roll).toBeGreaterThanOrEqual(0)
  })

  it('caps troop grants at remaining crew capacity', () => {
    const res = resolveEncounterChoice(
      { successChance: 1, grantUnitByFaction: { pirates: 'deckhand' }, grantCount: 6 },
      'pirates',
      [{ unitId: 'deckhand', count: 1 }],
      4,
      seedRng(1),
    )
    expect(res.troops).toEqual([{ unitId: 'deckhand', count: 4 }])
    expect(res.troopsGained).toEqual({ unitId: 'deckhand', count: 3 })
  })
})

describe('resolveEncounter action', () => {
  it('recruits settlers: pays gold, gains troops (capacity-capped), spends movement', () => {
    const { state, captainId } = stateWithEncounter('settlers')
    const { state: next, encounterOutcome } = applyActionWithOutcome(state, {
      type: 'resolveEncounter',
      playerId: 'p1',
      captainId,
      encounterId: 'test-enc',
      choice: 'recruit',
    })
    const cap = next.captains.find((c) => c.id === captainId)!
    expect(cap.troops).toEqual([{ unitId: 'deckhand', count: 4 }]) // sloop capacity 4
    expect(cap.movementPoints).toBe(0)
    expect(cap.xp).toBe(5)
    expect(next.players.find((p) => p.id === 'p1')!.resources.gold).toBe(
      GAME_SETUP.startingGold - 150,
    )
    const enc = next.encounters.find((e) => e.id === 'test-enc')!
    expect(enc.active).toBe(false)
    expect(enc.respawnRound).toBe(next.round + 3)
    expect(encounterOutcome).toMatchObject({ kind: 'settlers', choice: 'recruit', success: true })
  })

  it('failed rob costs troops and grants no reward', () => {
    const { state, captainId } = stateWithEncounter('merchant', {
      troops: [{ unitId: 'deckhand', count: 4 }],
    })
    const { state: next, encounterOutcome } = applyActionWithOutcome(state, {
      type: 'resolveEncounter',
      playerId: 'p1',
      captainId,
      encounterId: 'test-enc',
      choice: 'rob',
    })
    const cap = next.captains.find((c) => c.id === captainId)!
    expect(cap.troops).toEqual([{ unitId: 'deckhand', count: 2 }]) // 50% of 4 lost
    expect(next.players.find((p) => p.id === 'p1')!.resources.gold).toBe(GAME_SETUP.startingGold)
    expect(encounterOutcome).toMatchObject({ success: false })
    expect(encounterOutcome!.troopsLost).toEqual([{ unitId: 'deckhand', count: 2 }])
  })

  it('rejects a choice the encounter kind does not offer', () => {
    const { state, captainId } = stateWithEncounter('merchant')
    expect(() =>
      applyAction(state, {
        type: 'resolveEncounter',
        playerId: 'p1',
        captainId,
        encounterId: 'test-enc',
        choice: 'recruit',
      }),
    ).toThrow(InvalidActionError)
  })

  it('rejects engaging an encounter out of reach', () => {
    const { state, captainId } = stateWithEncounter('settlers')
    const moved: GameState = {
      ...state,
      encounters: state.encounters.map((e) => ({ ...e, position: { x: 0, y: 0 } })),
    }
    expect(() =>
      applyAction(moved, {
        type: 'resolveEncounter',
        playerId: 'p1',
        captainId,
        encounterId: 'test-enc',
        choice: 'recruit',
      }),
    ).toThrow(/not within reach/)
  })

  it('rejects an inactive encounter', () => {
    const { state, captainId } = stateWithEncounter('settlers')
    const spent: GameState = {
      ...state,
      encounters: state.encounters.map((e) => ({ ...e, active: false, respawnRound: 5 })),
    }
    expect(() =>
      applyAction(spent, {
        type: 'resolveEncounter',
        playerId: 'p1',
        captainId,
        encounterId: 'test-enc',
        choice: 'recruit',
      }),
    ).toThrow(/No active encounter/)
  })
})

describe('encounter respawn', () => {
  it('reactivates a consumed encounter once its delay elapses', () => {
    const { state, captainId } = stateWithEncounter('merchant')
    let s = applyAction(state, {
      type: 'resolveEncounter',
      playerId: 'p1',
      captainId,
      encounterId: 'test-enc',
      choice: 'trade',
    })
    expect(s.encounters[0]!.active).toBe(false)
    const respawnAt = s.encounters[0]!.respawnRound!
    // End turns until we cross the respawn round (2 players => 2 endTurns per round).
    let guard = 0
    while (s.round < respawnAt && guard++ < 20) {
      s = applyAction(s, { type: 'endTurn', playerId: s.players[s.currentPlayerIndex]!.id })
    }
    expect(s.round).toBeGreaterThanOrEqual(respawnAt)
    expect(s.encounters[0]!.active).toBe(true)
    expect(s.encounters[0]!.respawnRound).toBeNull()
  })
})

describe('encounter replay determinism', () => {
  it('replays identically and stays JSON-serializable', () => {
    const { state, captainId } = stateWithEncounter('natives', {
      troops: [{ unitId: 'deckhand', count: 2 }],
    })
    const actions: Action[] = [
      {
        type: 'resolveEncounter',
        playerId: 'p1',
        captainId,
        encounterId: 'test-enc',
        choice: 'quest',
      },
      { type: 'endTurn', playerId: 'p1' },
    ]
    const sequential = actions.reduce(applyAction, state)
    const replayed = replay(state, actions)
    expect(replayed).toEqual(sequential)
    expect(JSON.parse(JSON.stringify(replayed))).toEqual(replayed)
  })
})
