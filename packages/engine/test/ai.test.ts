import { describe, expect, it } from 'vitest'
import {
  captainsOf,
  createGame,
  currentPlayer,
  nextAiAction,
  runAiTurn,
  type CombatStatsData,
  type ContentCatalog,
  type GameConfig,
  type GameState,
} from '../src'
import { AI_TUNING, COMBAT_TUNING, GAME_SETUP, TACTICS_TUNING } from './fixtures'

const STATS: CombatStatsData = {
  units: [
    { id: 'grunt', attack: 5, defense: 2, health: 12 },
    { id: 'elite', attack: 12, defense: 8, health: 40 },
  ],
  ships: [{ id: 'sloop', hull: 40, cannons: 6, speed: 5 }],
  combat: COMBAT_TUNING,
  tactics: TACTICS_TUNING,
}

function config(p1Troops: number, p2Troops: number, unit = 'grunt'): GameConfig {
  return {
    seed: 3,
    mapSize: 'medium',
    setup: GAME_SETUP,
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

// --- Economy AI (#67): construction, recruit-vs-save, garrison/fleet, skills, upgrades ---

const ECON_CATALOG: ContentCatalog = {
  buildings: {
    townhall: { produces: { gold: 100 }, cost: {} },
    barracks: { produces: {}, cost: { gold: 150 }, requires: 'townhall', unlocksTier: 1 },
    distillery: { produces: { rum: 3 }, cost: { gold: 220 }, requires: 'townhall' },
    sawmill: { produces: { timber: 4 }, cost: { gold: 200 }, requires: 'townhall' },
    tradehouse: { produces: { gold: 60 }, cost: { gold: 350, timber: 15 }, requires: 'townhall' },
    shipyard: {
      produces: {},
      cost: { gold: 300 },
      requires: 'townhall',
      unlocksShipyard: true,
    },
  },
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
  ships: {
    sloop: {
      hull: 40,
      cannons: 6,
      speed: 5,
      crewCapacity: 4,
      upgrades: {
        hull: [{ goldCost: 150, amount: 15 }],
        cannons: [{ goldCost: 180, amount: 4 }],
      },
    },
  },
  skills: {
    'pirates-t1': { factionId: 'pirates', tier: 1, attackBonusPct: 10, defenseBonusPct: 0 },
    'pirates-t2': { factionId: 'pirates', tier: 2, attackBonusPct: 5, defenseBonusPct: 20 },
  },
  captainXpThresholds: [0, 150, 400, 800, 1400],
}

/**
 * p1 starts overwhelmingly weaker than p2 (mirrors the "holds" combat test), so
 * no attack/advance candidate ever outscores the economy decision under test.
 */
function econConfig(startingBuildings: string[] = ['townhall']): GameConfig {
  return {
    ...config(1, 999),
    setup: { ...GAME_SETUP, startingBuildings },
    content: ECON_CATALOG,
    aiTuning: AI_TUNING,
  }
}

function homeCity(state: GameState, playerId: string) {
  return state.cities.find((c) => c.ownerId === playerId)!
}

describe('economy AI', () => {
  it('builds the highest-utility affordable building when idle', () => {
    const state = createGame(econConfig())
    const city = homeCity(state, 'p1')
    // shipyard's flat unlock bonus (25) beats barracks' tier unlock (20), which
    // beats distillery/sawmill's raw production (18/16) — tradehouse needs
    // timber the player doesn't have yet, so it is not a candidate at all.
    expect(nextAiAction(state, 'p1')).toEqual({
      type: 'construct',
      playerId: 'p1',
      cityId: city.id,
      buildingId: 'shipyard',
    })
  })

  it('recruits the strongest affordable unit once a tier is unlocked', () => {
    let state = createGame(econConfig(['townhall', 'barracks']))
    const city = homeCity(state, 'p1')
    state = {
      ...state,
      cities: state.cities.map((c) =>
        c.id === city.id ? { ...c, builtThisRound: true, unitAvailability: { deckhand: 10 } } : c,
      ),
    }
    // Gold 1000, reserve 150, spend fraction 0.5 -> budget 425 -> floor(425/25)=17,
    // capped at the 10 available.
    expect(nextAiAction(state, 'p1')).toEqual({
      type: 'recruit',
      playerId: 'p1',
      cityId: city.id,
      unitId: 'deckhand',
      count: 10,
    })
  })

  it('does not recruit when gold is at or below the reserve', () => {
    let state = createGame(econConfig(['townhall', 'barracks']))
    const city = homeCity(state, 'p1')
    state = {
      ...state,
      players: state.players.map((p) =>
        p.id === 'p1' ? { ...p, resources: { ...p.resources, gold: 150 } } : p,
      ),
      cities: state.cities.map((c) =>
        c.id === city.id ? { ...c, builtThisRound: true, unitAvailability: { deckhand: 10 } } : c,
      ),
    }
    expect(nextAiAction(state, 'p1').type).not.toBe('recruit')
  })

  it('loads surplus garrisoned troops onto a docked captain, keeping a defense reserve', () => {
    let state = createGame(econConfig(['townhall', 'barracks']))
    const city = homeCity(state, 'p1')
    const captain = captainsOf(state, 'p1')[0]!
    state = {
      ...state,
      cities: state.cities.map((c) =>
        c.id === city.id ? { ...c, builtThisRound: true, garrison: { deckhand: 10 } } : c,
      ),
      captains: state.captains.map((cap) =>
        cap.id === captain.id ? { ...cap, position: { ...city.position } } : cap,
      ),
    }
    // Sloop capacity 4, 1 grunt already aboard -> 3 room. 30% of 10 garrisoned
    // (3, rounded up) stays behind for defense, leaving room as the binding cap.
    expect(nextAiAction(state, 'p1')).toEqual({
      type: 'transferTroops',
      playerId: 'p1',
      cityId: city.id,
      captainId: captain.id,
      direction: 'toShip',
      unitId: 'deckhand',
      count: 3,
    })
  })

  it('spends an available skill pick on the highest combat bonus', () => {
    let state = createGame(econConfig())
    const captain = captainsOf(state, 'p1')[0]!
    state = {
      ...state,
      captains: state.captains.map((c) => (c.id === captain.id ? { ...c, xp: 200 } : c)),
    }
    // Level 2 (xp 200 >= threshold 150) grants one pick; pirates-t2's +25 total
    // bonus beats pirates-t1's +10.
    expect(nextAiAction(state, 'p1')).toEqual({
      type: 'chooseCaptainSkill',
      playerId: 'p1',
      captainId: captain.id,
      skillId: 'pirates-t2',
    })
  })

  it('buys the cheapest ship upgrade at a docked shipyard', () => {
    let state = createGame(econConfig(['townhall', 'shipyard']))
    const city = homeCity(state, 'p1')
    const captain = captainsOf(state, 'p1')[0]!
    state = {
      ...state,
      cities: state.cities.map((c) => (c.id === city.id ? { ...c, builtThisRound: true } : c)),
    }
    expect(nextAiAction(state, 'p1')).toEqual({
      type: 'upgradeShip',
      playerId: 'p1',
      cityId: city.id,
      captainId: captain.id,
      track: 'hull',
    })
  })

  it('plays combat-only (no economy actions) when no content catalog is configured', () => {
    const state = createGame(config(1, 999))
    expect(nextAiAction(state, 'p1').type).toBe('endTurn')
  })
})
