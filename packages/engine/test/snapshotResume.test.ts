import { describe, expect, it } from 'vitest'
import {
  applyAction,
  createGame,
  currentPlayer,
  nextAiAction,
  replay,
  type Action,
  type ContentCatalog,
  type GameConfig,
  type GameState,
} from '../src'
import { AI_TUNING, COMBAT_TUNING, GAME_SETUP, TACTICS_TUNING } from './fixtures'

/**
 * Snapshot-resume determinism (#142). This is the engine-side contract behind
 * production's `reconstructState` (supabase/functions/_shared/match.ts) and the
 * snapshot compaction in #143: the server rebuilds authority by reading a
 * snapshot — a `GameState` that has made a round trip through jsonb — and
 * replaying the action tail on top of it. These tests assert that path is exact:
 *
 *   1. `GameState` survives `JSON.parse(JSON.stringify(...))` with no drift
 *      (no `undefined` / `Map` / `Set` / `NaN` / function values; `rngState`
 *      intact), because a snapshot is stored and reloaded as JSON.
 *   2. Resuming from a JSON-round-tripped snapshot at ANY prefix K and replaying
 *      the tail yields byte-identical state to replaying the whole log from the
 *      start — for every K, not just a sampled few.
 */

const CATALOG: ContentCatalog = {
  buildings: {
    townhall: { produces: { gold: 100 }, cost: {} },
    sawmill: { produces: { timber: 4 }, cost: { gold: 200 }, requires: 'townhall' },
    barracks: { produces: {}, cost: { gold: 150 }, requires: 'townhall', unlocksTier: 1 },
    shipyard: { produces: {}, cost: { gold: 300 }, requires: 'townhall' },
  },
  units: {
    deckhand: {
      factionId: 'pirates',
      tier: 1,
      goldCost: 25,
      weeklyGrowth: 8,
      attack: 4,
      defense: 2,
      health: 10,
    },
    sailor: {
      factionId: 'british',
      tier: 1,
      goldCost: 30,
      weeklyGrowth: 8,
      attack: 4,
      defense: 2,
      health: 10,
    },
    marine: {
      factionId: 'spanish',
      tier: 1,
      goldCost: 30,
      weeklyGrowth: 8,
      attack: 4,
      defense: 2,
      health: 10,
    },
  },
  ships: {
    sloop: {
      hull: 40,
      cannons: 6,
      speed: 6,
      crewCapacity: 6,
      upgrades: {
        hull: [{ goldCost: 150, amount: 15 }],
        cannons: [{ goldCost: 180, amount: 4 }],
      },
    },
  },
  skills: {
    'pirates-gunnery-1': { factionId: 'pirates', tier: 1, attackBonusPct: 10, defenseBonusPct: 0 },
  },
  captainXpThresholds: [0, 150, 400, 800, 1400],
  resourceNodes: {
    gold: { yield: { gold: 50 } },
    timber: { yield: { timber: 3 } },
    iron: { yield: { iron: 2 } },
    rum: { yield: { rum: 2 } },
  },
}

/**
 * A config that exercises the full action surface — combat (captains armed with
 * troops on a small map find each other), economy (content + AI tuning), and the
 * turn/round loop — so a driven game produces a long, RNG-touching log rather
 * than a stream of bare `endTurn`s. Units are deliberately tanky (high health,
 * low attack) so combat resolves rounds — consuming `rngState` — without a quick
 * elimination ending the game; a driven match then runs for dozens of rounds,
 * giving the prefix sweep a long, mixed log to bite on.
 */
function richConfig(seed: number, playerCount = 4): GameConfig {
  const factions = ['pirates', 'british', 'spanish', 'dutch'] as const
  const units = ['deckhand', 'sailor', 'marine', 'deckhand'] as const
  const stat = { attack: 1, defense: 3, health: 400 }
  return {
    seed,
    mapSize: 'small',
    setup: { ...GAME_SETUP, startingBuildings: ['townhall', 'barracks', 'shipyard'] },
    combatStats: {
      units: [
        { id: 'deckhand', ...stat },
        { id: 'sailor', ...stat },
        { id: 'marine', ...stat },
      ],
      ships: [{ id: 'sloop', hull: 40, cannons: 6, speed: 6 }],
      combat: COMBAT_TUNING,
      tactics: TACTICS_TUNING,
    },
    content: CATALOG,
    aiTuning: AI_TUNING,
    players: Array.from({ length: playerCount }, (_, i) => ({
      id: `p${i + 1}`,
      name: `Player ${i + 1}`,
      faction: factions[i % factions.length]!,
      isAI: true,
      startingTroops: [{ unitId: units[i % units.length]!, count: 6 }],
    })),
  }
}

/**
 * Drive the built-in AI to produce a real action log — the same reducer path the
 * server records into `match_actions`. Returns the log plus the (deterministically
 * reproducible) initial state it was generated from.
 */
function driveGame(config: GameConfig, maxActions = 400): { initial: GameState; log: Action[] } {
  const initial = createGame(config)
  let state = initial
  const log: Action[] = []
  while (state.status === 'active' && log.length < maxActions) {
    const pid = currentPlayer(state).id
    const action = nextAiAction(state, pid)
    log.push(action)
    state = applyAction(state, action)
  }
  return { initial, log }
}

/** Recursively assert a value contains only JSON-safe leaves (the snapshot contract). */
function assertJsonSafe(value: unknown, path = '$'): void {
  if (value === null) return
  if (value === undefined) throw new Error(`undefined at ${path} — dropped by JSON.stringify`)
  const t = typeof value
  if (t === 'number') {
    if (!Number.isFinite(value as number)) {
      throw new Error(`non-finite number at ${path} — JSON.stringify emits null`)
    }
    return
  }
  if (t === 'string' || t === 'boolean') return
  if (t === 'function' || t === 'bigint' || t === 'symbol') {
    throw new Error(`non-JSON ${t} at ${path}`)
  }
  if (value instanceof Map || value instanceof Set || value instanceof Date) {
    throw new Error(`${value.constructor.name} at ${path} — not JSON-round-trip stable`)
  }
  if (Array.isArray(value)) {
    value.forEach((v, i) => assertJsonSafe(v, `${path}[${i}]`))
    return
  }
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    assertJsonSafe(v, `${path}.${k}`)
  }
}

const roundTrip = (state: GameState): GameState => JSON.parse(JSON.stringify(state)) as GameState

describe('snapshot-resume determinism (#142)', () => {
  it('produces a long, RNG-touching log to test against', () => {
    const { initial, log } = driveGame(richConfig(1), 400)
    // Guard the fixture itself: a trivial all-endTurn log wouldn't stress replay.
    expect(log.length).toBe(400)
    const final = replay(initial, log)
    // Many round wraps — the log spans dozens of turns, not a single skirmish.
    expect(final.round).toBeGreaterThan(10)
    // rngState must have advanced — proof the log actually consumed randomness.
    expect(final.rngState).not.toBe(initial.rngState)
    // A genuine mix: movement, combat, economy, and endTurn all appear.
    const kinds = new Set(log.map((a) => a.type))
    expect(kinds.size).toBeGreaterThanOrEqual(4)
    expect(kinds.has('endTurn')).toBe(true)
  })

  it('GameState survives a JSON round trip losslessly (no undefined / Map / NaN drift)', () => {
    const { initial, log } = driveGame(richConfig(2), 300)
    const samples = [
      initial,
      replay(initial, log.slice(0, Math.floor(log.length / 2))),
      replay(initial, log),
    ]
    for (const state of samples) {
      assertJsonSafe(state)
      const round = roundTrip(state)
      // Byte-identical serialization: the strongest statement of losslessness.
      expect(JSON.stringify(round)).toBe(JSON.stringify(state))
      expect(round).toEqual(state)
    }
  })

  it('preserves rngState exactly across the JSON round trip', () => {
    const { initial, log } = driveGame(richConfig(3), 300)
    let state = initial
    for (const action of log) {
      const round = roundTrip(state)
      expect(round.rngState).toBe(state.rngState)
      expect(Number.isInteger(state.rngState)).toBe(true)
      expect(Number.isNaN(state.rngState)).toBe(false)
      state = applyAction(state, action)
    }
  })

  it('resuming from a JSON-round-tripped snapshot at EVERY prefix K equals a full replay', () => {
    // Every-K is O(N^2) in applyAction, so keep this log moderate; the strided
    // seed sweep below covers longer logs.
    const { initial, log } = driveGame(richConfig(4), 120)
    const full = replay(initial, log)
    const fullJson = JSON.stringify(full)

    // Precompute state at each K so the snapshot is taken from a mid-game state,
    // exactly as the server snapshots after a turn advance.
    let stateAtK = initial
    for (let k = 0; k <= log.length; k++) {
      const snapshot = roundTrip(stateAtK)
      const resumed = replay(snapshot, log.slice(k))
      expect(JSON.stringify(resumed)).toBe(fullJson)
      if (k < log.length) stateAtK = applyAction(stateAtK, log[k]!)
    }
  })

  it('is robust across seeds: every prefix resume matches a full replay', () => {
    for (const seed of [10, 20, 30]) {
      const { initial, log } = driveGame(richConfig(seed, 3), 300)
      const fullJson = JSON.stringify(replay(initial, log))
      let stateAtK = initial
      // Representative sample of prefixes (endpoints + strided interior).
      const stride = Math.max(1, Math.floor(log.length / 12))
      for (let k = 0; k <= log.length; k++) {
        if (k === log.length || k % stride === 0) {
          const resumed = replay(roundTrip(stateAtK), log.slice(k))
          expect(JSON.stringify(resumed)).toBe(fullJson)
        }
        if (k < log.length) stateAtK = applyAction(stateAtK, log[k]!)
      }
    }
  })
})
