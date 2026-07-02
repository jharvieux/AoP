import { describe, expect, it } from 'vitest'
import {
  applyAction,
  availableSkillPicks,
  captainsOf,
  createGame,
  createCombatStats,
  currentPlayer,
  estimateOdds,
  InvalidActionError,
  levelForXp,
  nextFloat,
  nextInt,
  replay,
  seedRng,
  visibleState,
  type Action,
  type CombatStatsData,
  type Combatant,
  type ContentCatalog,
  type GameConfig,
  type GameState,
} from '../src'
import { COMBAT_TUNING, GAME_SETUP, TACTICS_TUNING } from './fixtures'

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

// --- Content catalog + combat stats fixtures for the additive systems ---------

const TEST_CATALOG: ContentCatalog = {
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
      attack: 2,
      defense: 1,
      health: 6,
    },
    buccaneer: {
      factionId: 'pirates',
      tier: 3,
      goldCost: 140,
      weeklyGrowth: 3,
      attack: 8,
      defense: 5,
      health: 22,
    },
    sailor: {
      factionId: 'british',
      tier: 1,
      goldCost: 30,
      weeklyGrowth: 8,
      attack: 2,
      defense: 2,
      health: 7,
    },
  },
  ships: {
    sloop: {
      hull: 40,
      cannons: 6,
      speed: 5,
      crewCapacity: 4,
      upgrades: {
        hull: [
          { goldCost: 150, amount: 15 },
          { goldCost: 350, amount: 20 },
        ],
        cannons: [{ goldCost: 180, amount: 4 }],
      },
    },
  },
  skills: {
    'pirates-gunnery-1': { factionId: 'pirates', tier: 1, attackBonusPct: 10, defenseBonusPct: 0 },
  },
  captainXpThresholds: [0, 150, 400, 800, 1400],
}

const COMBAT_STATS: CombatStatsData = {
  units: [
    { id: 'deckhand', attack: 2, defense: 1, health: 6 },
    { id: 'buccaneer', attack: 8, defense: 5, health: 22 },
    { id: 'sailor', attack: 2, defense: 2, health: 7 },
  ],
  ships: [{ id: 'sloop', hull: 40, cannons: 6, speed: 5 }],
  combat: COMBAT_TUNING,
  tactics: TACTICS_TUNING,
}

/** Config with content + combat stats wired in and recruit/shipyard ready from turn 1. */
function econConfig(): GameConfig {
  return {
    seed: 7,
    mapSize: 'small',
    setup: { ...GAME_SETUP, startingBuildings: ['townhall', 'barracks', 'shipyard'] },
    combatStats: COMBAT_STATS,
    content: TEST_CATALOG,
    players: [
      { id: 'p1', name: 'One', faction: 'pirates', isAI: false },
      { id: 'p2', name: 'Two', faction: 'british', isAI: true },
    ],
  }
}

function homeCity(state: GameState, playerId: string) {
  return state.cities.find((c) => c.ownerId === playerId)!
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

  it('places one capital city per player on a home-island port', () => {
    const state = createGame(testConfig(3))
    expect(state.cities).toHaveLength(3)
    for (const city of state.cities) {
      const tile = state.map.tiles[city.position.y * state.map.width + city.position.x]!
      expect(tile.type).toBe('port')
    }
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

describe('economy & cities', () => {
  it('grants per-round income from standing buildings when the round wraps', () => {
    let state = createGame(econConfig())
    const startGold = state.players[0]!.resources.gold
    state = applyAction(state, { type: 'endTurn', playerId: 'p1' })
    state = applyAction(state, { type: 'endTurn', playerId: 'p2' }) // wrap -> round 2
    expect(state.round).toBe(2)
    // townhall (in starting buildings) produces 100 gold each round.
    expect(state.players[0]!.resources.gold).toBe(startGold + 100)
  })

  it('constructs a building, spends its cost, and enforces one build per turn', () => {
    let state = createGame(econConfig())
    const city = homeCity(state, 'p1')
    state = applyAction(state, {
      type: 'construct',
      playerId: 'p1',
      cityId: city.id,
      buildingId: 'sawmill',
    })
    expect(homeCity(state, 'p1').buildings).toContain('sawmill')
    expect(state.players[0]!.resources.gold).toBe(1000 - 200)
    expect(() =>
      applyAction(state, {
        type: 'construct',
        playerId: 'p1',
        cityId: city.id,
        buildingId: 'shipyard',
      }),
    ).toThrow(InvalidActionError)
  })

  it('recruits into the garrison and transfers troops to an adjacent captain', () => {
    let state = createGame(econConfig())
    const city = homeCity(state, 'p1')
    state = applyAction(state, {
      type: 'recruit',
      playerId: 'p1',
      cityId: city.id,
      unitId: 'deckhand',
      count: 3,
    })
    expect(homeCity(state, 'p1').garrison.deckhand).toBe(3)
    state = applyAction(state, {
      type: 'transferTroops',
      playerId: 'p1',
      cityId: city.id,
      captainId: captainsOf(state, 'p1')[0]!.id,
      direction: 'toShip',
      unitId: 'deckhand',
      count: 3,
    })
    expect(captainsOf(state, 'p1')[0]!.troops).toEqual([{ unitId: 'deckhand', count: 3 }])
    expect(homeCity(state, 'p1').garrison.deckhand).toBe(0)
  })

  it('rejects recruiting a tier the city has not unlocked', () => {
    const state = createGame(econConfig())
    const city = homeCity(state, 'p1')
    expect(() =>
      applyAction(state, {
        type: 'recruit',
        playerId: 'p1',
        cityId: city.id,
        unitId: 'buccaneer',
        count: 1,
      }),
    ).toThrow(InvalidActionError)
  })

  it('rejects economy actions when no content catalog is configured', () => {
    const state = createGame(testConfig(2))
    const city = homeCity(state, 'p1')
    expect(() =>
      applyAction(state, {
        type: 'construct',
        playerId: 'p1',
        cityId: city.id,
        buildingId: 'sawmill',
      }),
    ).toThrow(InvalidActionError)
  })
})

describe('captain progression', () => {
  it('gains XP, levels up, and spends a skill pick', () => {
    let state = createGame(econConfig())
    const capId = captainsOf(state, 'p1')[0]!.id
    state = applyAction(state, {
      type: 'gainCaptainXp',
      playerId: 'p1',
      captainId: capId,
      amount: 200,
    })
    const cap = captainsOf(state, 'p1')[0]!
    expect(cap.xp).toBe(200)
    expect(levelForXp(cap.xp, TEST_CATALOG.captainXpThresholds)).toBe(2)
    expect(availableSkillPicks(cap, TEST_CATALOG.captainXpThresholds)).toBe(1)
    state = applyAction(state, {
      type: 'chooseCaptainSkill',
      playerId: 'p1',
      captainId: capId,
      skillId: 'pirates-gunnery-1',
    })
    expect(captainsOf(state, 'p1')[0]!.skills).toContain('pirates-gunnery-1')
  })

  it('buys a ship upgrade at a docked shipyard', () => {
    let state = createGame(econConfig())
    const city = homeCity(state, 'p1')
    const capId = captainsOf(state, 'p1')[0]!.id
    state = applyAction(state, {
      type: 'upgradeShip',
      playerId: 'p1',
      cityId: city.id,
      captainId: capId,
      track: 'hull',
    })
    expect(captainsOf(state, 'p1')[0]!.shipUpgrades.hull).toBe(1)
    expect(state.players[0]!.resources.gold).toBe(1000 - 150)
  })
})

describe('fog of war', () => {
  it('reveals tiles around a player’s city and captain, and accumulates explored history', () => {
    const state = createGame(econConfig())
    const { visible, explored } = visibleState(state, 'p1')
    expect(visible.length).toBeGreaterThan(0)
    expect(explored.length).toBeGreaterThanOrEqual(visible.length)
    expect(visible.length).toBeLessThan(state.map.width * state.map.height)
  })
})

describe('combat odds preview', () => {
  it('estimates win probabilities that partition all trials', () => {
    const stats = createCombatStats(COMBAT_STATS)
    const attacker: Combatant = {
      captainId: 'a',
      ownerId: 'p1',
      shipClassId: 'sloop',
      troops: [{ unitId: 'buccaneer', count: 4 }],
    }
    const defender: Combatant = {
      captainId: 'd',
      ownerId: 'p2',
      shipClassId: 'sloop',
      troops: [{ unitId: 'sailor', count: 2 }],
    }
    const odds = estimateOdds({ attacker, defender }, stats, 99, 100)
    expect(odds.trials).toBe(100)
    expect(odds.attackerWinProbability + odds.defenderWinProbability).toBeCloseTo(1)
    expect(odds.attackerWinProbability).toBeGreaterThan(0.5)
  })

  it('is a pure function of its arguments (does not touch game RNG)', () => {
    const stats = createCombatStats(COMBAT_STATS)
    const input = {
      attacker: {
        captainId: 'a',
        ownerId: 'p1',
        shipClassId: 'sloop',
        troops: [{ unitId: 'deckhand', count: 3 }],
      },
      defender: {
        captainId: 'd',
        ownerId: 'p2',
        shipClassId: 'sloop',
        troops: [{ unitId: 'sailor', count: 3 }],
      },
    }
    expect(estimateOdds(input, stats, 5, 50)).toEqual(estimateOdds(input, stats, 5, 50))
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

  it('replays the additive economy/progression actions identically', () => {
    const cap = 'cap-p1'
    const cityId = 'p1-capital'
    const log: Action[] = [
      { type: 'construct', playerId: 'p1', cityId, buildingId: 'sawmill' },
      { type: 'recruit', playerId: 'p1', cityId, unitId: 'deckhand', count: 2 },
      {
        type: 'transferTroops',
        playerId: 'p1',
        cityId,
        captainId: cap,
        direction: 'toShip',
        unitId: 'deckhand',
        count: 2,
      },
      { type: 'gainCaptainXp', playerId: 'p1', captainId: cap, amount: 200 },
      { type: 'chooseCaptainSkill', playerId: 'p1', captainId: cap, skillId: 'pirates-gunnery-1' },
      { type: 'upgradeShip', playerId: 'p1', cityId, captainId: cap, track: 'hull' },
      { type: 'endTurn', playerId: 'p1' },
      { type: 'endTurn', playerId: 'p2' },
    ]
    const a = replay(createGame(econConfig()), log)
    const b = replay(createGame(econConfig()), log)
    expect(JSON.stringify(a)).toBe(JSON.stringify(b))
    expect(a.actionCount).toBe(log.length)
  })
})
