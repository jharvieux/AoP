import { describe, expect, it } from 'vitest'
import {
  applyAction,
  applyActionWithOutcome,
  captainsOf,
  cityToCombatant,
  createCombatStats,
  createGame,
  garrisonToTroops,
  nextAiAction,
  replay,
  type Action,
  type CombatStatsData,
  type ContentCatalog,
  type GameConfig,
  type GameState,
} from '../src'
import { AI_TUNING, BATTLE_TUNING, COMBAT_TUNING, GAME_SETUP, TACTICS_TUNING } from './fixtures'

/**
 * City assault (#344) — the conquest win condition. These tests are the replay
 * contract for the new `attackCity` action: an attacker's embarked troops fight
 * the garrison on the land board, a decisive win flips the city's ownership, and
 * a seat that loses its last city (with no live captain) is eliminated — which
 * is what finally makes conquest victory reachable. All of it must replay
 * bit-exact from the action log.
 */

const UNITS = [
  { id: 'grunt', attack: 5, defense: 2, health: 12, speed: 5 },
  { id: 'brute', attack: 12, defense: 8, health: 40, speed: 4 },
]
const SHIPS = [{ id: 'sloop', hull: 40, cannons: 6, speed: 5 }]

const STATS: CombatStatsData = {
  units: UNITS,
  ships: SHIPS,
  combat: COMBAT_TUNING,
  tactics: TACTICS_TUNING,
  battle: BATTLE_TUNING,
}

/** A minimal content catalog carrying fortification defense bonuses for the wall tests. */
const CATALOG: ContentCatalog = {
  buildings: {
    townhall: { produces: { gold: 100 }, cost: {} },
    palisade: { produces: {}, cost: { gold: 120 }, requires: 'townhall', defenseBonus: 10 },
    citadel: { produces: {}, cost: { gold: 1400 }, requires: 'palisade', defenseBonus: 70 },
  },
  units: {
    grunt: {
      factionId: 'pirates',
      tier: 1,
      goldCost: 25,
      weeklyGrowth: 8,
      attack: 5,
      defense: 2,
      health: 12,
    },
  },
  ships: {
    sloop: { hull: 40, cannons: 6, speed: 5, crewCapacity: 12, upgrades: {} },
  },
  skills: {},
  captainXpThresholds: [0, 150, 400, 800, 1400],
  resourceNodes: {},
}

function baseConfig(): GameConfig {
  return {
    seed: 7,
    mapSize: 'small',
    setup: GAME_SETUP,
    combatStats: STATS,
    content: CATALOG,
    aiTuning: AI_TUNING,
    players: [
      { id: 'p1', name: 'P1', faction: 'pirates', isAI: false },
      { id: 'p2', name: 'P2', faction: 'british', isAI: true },
    ],
  }
}

/**
 * A state where p1's captain sits one tile off p2's city, carrying `attackerTroops`,
 * and p2's city holds `garrison`. `p2HasCaptain=false` removes p2's captain, so
 * losing the city eliminates the seat (the conquest path).
 */
function assaultState(opts: {
  attackerTroops: { unitId: string; count: number }[]
  garrison: Record<string, number>
  buildings?: string[]
  p2HasCaptain?: boolean
  ally?: boolean
}): GameState {
  const state = createGame(baseConfig())
  const p1cap = captainsOf(state, 'p1')[0]!
  const p2city = state.cities.find((c) => c.ownerId === 'p2')!
  const adjacent = { x: p2city.position.x + 1, y: p2city.position.y }

  let captains = state.captains.map((c) =>
    c.id === p1cap.id ? { ...c, position: adjacent, troops: opts.attackerTroops } : c,
  )
  if (opts.p2HasCaptain === false) {
    captains = captains.filter((c) => c.ownerId !== 'p2')
  }

  return {
    ...state,
    captains,
    cities: state.cities.map((c) =>
      c.id === p2city.id
        ? { ...c, garrison: opts.garrison, buildings: opts.buildings ?? c.buildings }
        : c,
    ),
    alliances: opts.ally ? { ...state.alliances, pairs: [{ a: 'p1', b: 'p2' }] } : state.alliances,
  }
}

describe('cityToCombatant (#344)', () => {
  it('converts a garrison to a sorted, ship-less troop list', () => {
    const troops = garrisonToTroops({ grunt: 4, brute: 2 })
    // Sorted by unit id for deterministic board deployment, regardless of key order.
    expect(troops).toEqual([
      { unitId: 'brute', count: 2 },
      { unitId: 'grunt', count: 4 },
    ])
    const c = cityToCombatant(
      {
        id: 'c1',
        ownerId: 'p2',
        name: 'C',
        position: { x: 0, y: 0 },
        buildings: [],
        builtThisRound: false,
        garrison: { grunt: 4 },
        unitAvailability: {},
      },
      CATALOG,
    )
    expect(c.shipStats).toEqual({ hull: 0, cannons: 0, speed: 0 })
    expect(c.troops).toEqual([{ unitId: 'grunt', count: 4 }])
    expect(c.defenseBonusPct).toBeUndefined()
  })

  it('sums fortification defense bonuses from standing buildings', () => {
    const c = cityToCombatant(
      {
        id: 'c1',
        ownerId: 'p2',
        name: 'C',
        position: { x: 0, y: 0 },
        buildings: ['townhall', 'palisade', 'citadel'],
        builtThisRound: false,
        garrison: { grunt: 1 },
        unitAvailability: {},
      },
      CATALOG,
    )
    expect(c.defenseBonusPct).toBe(80)
  })
})

describe('attackCity — capture and conquest', () => {
  it('a strong landing force captures the city and empties its garrison', () => {
    const state = assaultState({
      attackerTroops: [{ unitId: 'brute', count: 12 }],
      garrison: { grunt: 2 },
    })
    const p1cap = captainsOf(state, 'p1')[0]!
    const targetCity = state.cities.find((c) => c.ownerId === 'p2')!
    const { state: next, battleReport } = applyActionWithOutcome(state, {
      type: 'attackCity',
      playerId: 'p1',
      captainId: p1cap.id,
      targetCityId: targetCity.id,
    })
    expect(battleReport!.board).toBeDefined()
    expect(battleReport!.board!.context).toBe('land')
    const city = next.cities.find((c) => c.id === targetCity.id)!
    expect(city.ownerId).toBe('p1')
    expect(city.garrison).toEqual({})
    // Attacker kept its survivors and spent its movement.
    const cap = next.captains.find((c) => c.id === p1cap.id)!
    expect(cap.movementPoints).toBe(0)
    expect(cap.troops.reduce((s, t) => s + t.count, 0)).toBeGreaterThan(0)
  })

  it('capturing a seat’s last city with no live captain wins by conquest', () => {
    const state = assaultState({
      attackerTroops: [{ unitId: 'brute', count: 12 }],
      garrison: { grunt: 1 },
      p2HasCaptain: false,
    })
    const p1cap = captainsOf(state, 'p1')[0]!
    const targetCity = state.cities.find((c) => c.ownerId === 'p2')!
    const next = applyAction(state, {
      type: 'attackCity',
      playerId: 'p1',
      captainId: p1cap.id,
      targetCityId: targetCity.id,
    })
    expect(next.players.find((p) => p.id === 'p2')!.eliminated).toBe(true)
    expect(next.status).toBe('finished')
    expect(next.winnerId).toBe('p1')
  })

  it('a failed assault captures the attacking captain and leaves the city defended', () => {
    const state = assaultState({
      attackerTroops: [{ unitId: 'grunt', count: 1 }],
      garrison: { brute: 12 },
    })
    const p1cap = captainsOf(state, 'p1')[0]!
    const targetCity = state.cities.find((c) => c.ownerId === 'p2')!
    const next = applyAction(state, {
      type: 'attackCity',
      playerId: 'p1',
      captainId: p1cap.id,
      targetCityId: targetCity.id,
    })
    const city = next.cities.find((c) => c.id === targetCity.id)!
    expect(city.ownerId).toBe('p2')
    expect(Object.values(city.garrison).reduce((s, n) => s + n, 0)).toBeGreaterThan(0)
    const cap = next.captains.find((c) => c.id === p1cap.id)!
    expect(cap.captured).toBe(true)
    expect(cap.capturedBy).toBe('p2')
    expect(cap.troops).toHaveLength(0)
  })
})

describe('attackCity — validation', () => {
  const validState = () =>
    assaultState({ attackerTroops: [{ unitId: 'grunt', count: 4 }], garrison: { grunt: 1 } })

  it('rejects assaulting your own city', () => {
    const state = validState()
    const p1cap = captainsOf(state, 'p1')[0]!
    const ownCity = state.cities.find((c) => c.ownerId === 'p1')!
    expect(() =>
      applyAction(state, {
        type: 'attackCity',
        playerId: 'p1',
        captainId: p1cap.id,
        targetCityId: ownCity.id,
      }),
    ).toThrow()
  })

  it('rejects an out-of-range city', () => {
    const state = validState()
    const p1cap = captainsOf(state, 'p1')[0]!
    const targetCity = state.cities.find((c) => c.ownerId === 'p2')!
    const far = {
      ...state,
      captains: state.captains.map((c) =>
        c.id === p1cap.id
          ? { ...c, position: { x: targetCity.position.x + 5, y: targetCity.position.y + 5 } }
          : c,
      ),
    }
    expect(() =>
      applyAction(far, {
        type: 'attackCity',
        playerId: 'p1',
        captainId: p1cap.id,
        targetCityId: targetCity.id,
      }),
    ).toThrow()
  })

  it('rejects an assault by a captain carrying no troops', () => {
    const state = assaultState({ attackerTroops: [], garrison: { grunt: 1 } })
    const p1cap = captainsOf(state, 'p1')[0]!
    const targetCity = state.cities.find((c) => c.ownerId === 'p2')!
    expect(() =>
      applyAction(state, {
        type: 'attackCity',
        playerId: 'p1',
        captainId: p1cap.id,
        targetCityId: targetCity.id,
      }),
    ).toThrow()
  })
})

describe('attackCity — betrayal (#138/#177)', () => {
  it('assaulting an allied city breaks the alliance and costs reputation', () => {
    const state = assaultState({
      attackerTroops: [{ unitId: 'brute', count: 12 }],
      garrison: { grunt: 1 },
      ally: true,
    })
    const p1cap = captainsOf(state, 'p1')[0]!
    const targetCity = state.cities.find((c) => c.ownerId === 'p2')!
    const before = state.players.find((p) => p.id === 'p1')!.reputation
    const next = applyAction(state, {
      type: 'attackCity',
      playerId: 'p1',
      captainId: p1cap.id,
      targetCityId: targetCity.id,
    })
    expect(next.alliances.pairs).toHaveLength(0)
    expect(next.players.find((p) => p.id === 'p1')!.reputation).toBeLessThan(before)
  })
})

describe('attackCity — replay determinism (the contract)', () => {
  it('replays bit-exact from the action log', () => {
    const state = assaultState({
      attackerTroops: [{ unitId: 'brute', count: 8 }],
      garrison: { grunt: 5 },
    })
    const p1cap = captainsOf(state, 'p1')[0]!
    const targetCity = state.cities.find((c) => c.ownerId === 'p2')!
    const log: Action[] = [
      { type: 'attackCity', playerId: 'p1', captainId: p1cap.id, targetCityId: targetCity.id },
    ]
    expect(replay(state, log)).toEqual(replay(state, log))
    const a = applyActionWithOutcome(state, log[0]!)
    const b = applyActionWithOutcome(state, log[0]!)
    expect(JSON.stringify(a)).toBe(JSON.stringify(b))
  })
})

describe('attackCity — AI conquest behavior', () => {
  it('an AI captain adjacent to a beatable enemy city assaults it', () => {
    const state = assaultState({
      attackerTroops: [{ unitId: 'brute', count: 12 }],
      garrison: { grunt: 1 },
    })
    const action = nextAiAction(state, 'p1')
    expect(action.type).toBe('attackCity')
  })

  it('the AI never assaults an allied seat’s city', () => {
    const state = assaultState({
      attackerTroops: [{ unitId: 'brute', count: 12 }],
      garrison: { grunt: 1 },
      ally: true,
    })
    const action = nextAiAction(state, 'p1')
    expect(action.type).not.toBe('attackCity')
  })

  it('scores an assault on troops alone — a strong ship cannot carry a weak landing party (#442)', () => {
    // 2 grunts (strength 12) against an 8-grunt garrison (strength 48): a
    // troops-only ratio of 0.25, below even the attrition floor (0.40, #462), so
    // the AI holds. Counting the sloop's hull+cannons (~16) would push the ratio
    // to 28/48 ≈ 0.58 — over the attrition floor — and the AI would storm and
    // lose its captain. The ship never fights in a land assault; it must not tip
    // the decision. (Retargeted for #462: the old 4-grunt garrison put this at
    // ratio 0.5, which is now inside the attrition band; the ship-exclusion
    // invariant this guards is unchanged, just measured with a wider margin.)
    const state = assaultState({
      attackerTroops: [{ unitId: 'grunt', count: 2 }],
      garrison: { grunt: 8 },
      p2HasCaptain: false,
    })
    expect(nextAiAction(state, 'p1').type).not.toBe('attackCity')
  })

  it('still assaults when the landing party alone matches the garrison', () => {
    // 4 grunts vs 4 grunts: troops-only ratio 1.0 clears the 0.9 engage gate.
    const state = assaultState({
      attackerTroops: [{ unitId: 'grunt', count: 4 }],
      garrison: { grunt: 4 },
      p2HasCaptain: false,
    })
    expect(nextAiAction(state, 'p1').type).toBe('attackCity')
  })

  it('launches an attrition assault it does not expect to win (#462)', () => {
    // 6 grunts (36) vs an 8-grunt garrison (48): a troops-only ratio of 0.75 —
    // below the 0.9 engage gate (no clean win) but above the 0.40 attrition floor.
    // The failed assault will thin the recruited garrison, and that damage
    // persists between assaults, so the wave is worth launching. Before #462 the
    // absolute engage gate refused this outright.
    const state = assaultState({
      attackerTroops: [{ unitId: 'grunt', count: 6 }],
      garrison: { grunt: 8 },
      p2HasCaptain: false,
    })
    expect(nextAiAction(state, 'p1').type).toBe('attackCity')
  })

  it('holds when the landing party is too weak to dent the garrison (#462)', () => {
    // 3 grunts (18) vs a 12-grunt garrison (72): ratio 0.25, below the attrition
    // floor. Landing here would just feed the captain to the defenders for
    // negligible depletion — the cost-effectiveness bound the floor enforces.
    const state = assaultState({
      attackerTroops: [{ unitId: 'grunt', count: 3 }],
      garrison: { grunt: 12 },
      p2HasCaptain: false,
    })
    expect(nextAiAction(state, 'p1').type).not.toBe('attackCity')
  })
})
