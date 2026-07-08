import { describe, expect, it } from 'vitest'
import type { Coord } from '@aop/shared'
import {
  applyAction,
  availableSkillPicks,
  captainsOf,
  createGame,
  createCombatStats,
  currentlyVisibleTiles,
  currentPlayer,
  estimateOdds,
  InvalidActionError,
  levelForXp,
  mapDistance,
  nextFloat,
  nextInt,
  replay,
  RULES_VERSION,
  seedRng,
  tileKey,
  visibleState,
  type Action,
  type Captain,
  type CombatStatsData,
  type Combatant,
  type ContentCatalog,
  type GameConfig,
  type GameMap,
  type GameSetup,
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
  resourceNodes: {
    gold: { yield: { gold: 50 } },
    timber: { yield: { timber: 3 } },
    iron: { yield: { iron: 2 } },
    rum: { yield: { rum: 2 } },
  },
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

  it('generates a hex map when config.topology is hex, square when absent (#389)', () => {
    const hex = createGame({ ...testConfig(), topology: 'hex' })
    expect(hex.map.topology).toBe('hex')
    expect(createGame(testConfig()).map.topology).toBeUndefined()
  })

  it('is deterministic for hex-topology configs (#389)', () => {
    const config = (): GameConfig => ({ ...testConfig(), topology: 'hex' })
    expect(createGame(config())).toEqual(createGame(config()))
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

  it('sweeps a resigned seat’s captains and cities off the board (#208)', () => {
    let state = createGame(testConfig(3))
    const ghost = captainsOf(state, 'p2')[0]!
    expect(state.cities.some((c) => c.ownerId === 'p2')).toBe(true)

    state = applyAction(state, { type: 'endTurn', playerId: 'p1' })
    state = applyAction(state, { type: 'resign', playerId: 'p2' })

    expect(state.captains.some((c) => c.ownerId === 'p2')).toBe(false)
    expect(state.cities.some((c) => c.ownerId === 'p2')).toBe(false)
    // The ghost fleet is gone, so it can never be attacked (or XP-farmed).
    const p3cap = captainsOf(state, 'p3')[0]!
    expect(() =>
      applyAction(state, {
        type: 'attackCaptain',
        playerId: 'p3',
        captainId: p3cap.id,
        targetCaptainId: ghost.id,
      }),
    ).toThrow(InvalidActionError)
  })

  it('replays a resign log to an identical swept state (#208)', () => {
    const base = createGame(testConfig(3))
    const log: Action[] = [
      { type: 'endTurn', playerId: 'p1' },
      { type: 'resign', playerId: 'p2' },
      { type: 'endTurn', playerId: 'p3' },
    ]
    expect(JSON.stringify(replay(base, log))).toBe(JSON.stringify(replay(base, log)))
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

  it('grants a resource-node bonus (#101) on top of city income to whichever player holds the tile', () => {
    const base = createGame(econConfig())
    const captain = captainsOf(base, 'p1')[0]!
    let state: GameState = {
      ...base,
      resourceNodes: [{ id: 'res-0', kind: 'gold', position: { ...captain.position } }],
    }
    const startGold = state.players[0]!.resources.gold
    state = applyAction(state, { type: 'endTurn', playerId: 'p1' })
    state = applyAction(state, { type: 'endTurn', playerId: 'p2' }) // wrap -> round 2
    // townhall's 100 gold, plus the gold node's 50 while p1's captain sits on it.
    expect(state.players[0]!.resources.gold).toBe(startGold + 100 + 50)
  })

  it('grants no resource-node bonus when no captain is standing on the node', () => {
    const base = createGame(econConfig())
    let state: GameState = {
      ...base,
      resourceNodes: [{ id: 'res-0', kind: 'gold', position: { x: 0, y: 0 } }],
    }
    const captainOnNode = state.captains.some((c) => c.position.x === 0 && c.position.y === 0)
    expect(captainOnNode).toBe(false)
    const startGold = state.players[0]!.resources.gold
    state = applyAction(state, { type: 'endTurn', playerId: 'p1' })
    state = applyAction(state, { type: 'endTurn', playerId: 'p2' })
    expect(state.players[0]!.resources.gold).toBe(startGold + 100)
  })

  it('does not let a captured captain keep yielding a resource node for its former owner (#309)', () => {
    const base = createGame(econConfig())
    const captain = captainsOf(base, 'p1')[0]!
    const captured: GameState = {
      ...base,
      captains: base.captains.map((c) =>
        c.id === captain.id ? { ...c, captured: true, capturedBy: 'p2' } : c,
      ),
      resourceNodes: [{ id: 'res-0', kind: 'gold', position: { ...captain.position } }],
    }
    const startGold = captured.players[0]!.resources.gold
    let state = applyAction(captured, { type: 'endTurn', playerId: 'p1' })
    state = applyAction(state, { type: 'endTurn', playerId: 'p2' }) // wrap -> round 2
    // Only the townhall's 100 gold — the captured captain sitting on the node
    // no longer counts as an occupant, so the node yields to no one (neutral,
    // no ownerSeat authored).
    expect(state.players[0]!.resources.gold).toBe(startGold + 100)
  })

  it('grants the resource-node bonus to whichever owner currently occupies the tile, not a fixed owner', () => {
    const base = createGame(econConfig())
    const p2Captain = captainsOf(base, 'p2')[0]!
    let state: GameState = {
      ...base,
      resourceNodes: [{ id: 'res-0', kind: 'timber', position: { ...p2Captain.position } }],
    }
    const startGoldP1 = state.players[0]!.resources.gold
    state = applyAction(state, { type: 'endTurn', playerId: 'p1' })
    state = applyAction(state, { type: 'endTurn', playerId: 'p2' }) // wrap -> round 2
    // p1's captain never stood on the node, so p1 only collects its city income.
    expect(state.players[0]!.resources.gold).toBe(startGoldP1 + 100)
    const p2 = state.players.find((p) => p.id === 'p2')!
    expect(p2.resources.timber).toBe(3)
  })

  it('yields to the authored ownerSeat player when no captain occupies the node (#211)', () => {
    const base = createGame(econConfig())
    // (0,0) is unoccupied — the same situation as a land node, which
    // water-bound captains can never stand on.
    expect(base.captains.some((c) => c.position.x === 0 && c.position.y === 0)).toBe(false)
    let state: GameState = {
      ...base,
      resourceNodes: [{ id: 'res-0', kind: 'timber', position: { x: 0, y: 0 }, ownerSeat: 1 }],
    }
    state = applyAction(state, { type: 'endTurn', playerId: 'p1' })
    state = applyAction(state, { type: 'endTurn', playerId: 'p2' }) // wrap -> round 2
    expect(state.players.find((p) => p.id === 'p2')!.resources.timber).toBe(3)
    expect(state.players[0]!.resources.timber).toBe(0)
  })

  it('lets an occupying rival override ownerSeat while standing on the node (#211)', () => {
    const base = createGame(econConfig())
    const p1Captain = captainsOf(base, 'p1')[0]!
    let state: GameState = {
      ...base,
      resourceNodes: [
        { id: 'res-0', kind: 'timber', position: { ...p1Captain.position }, ownerSeat: 1 },
      ],
    }
    state = applyAction(state, { type: 'endTurn', playerId: 'p1' })
    state = applyAction(state, { type: 'endTurn', playerId: 'p2' }) // wrap -> round 2
    expect(state.players[0]!.resources.timber).toBe(3)
    expect(state.players.find((p) => p.id === 'p2')!.resources.timber).toBe(0)
  })

  it('breaks a co-occupation tie in favor of ownerSeat, else captains-array order (#211)', () => {
    const base = createGame(econConfig())
    const p1Captain = captainsOf(base, 'p1')[0]!
    // Park p2's captain on the same tile as p1's — GameState permits
    // co-occupation even though normal movement contests it via combat.
    const captains = base.captains.map((c) =>
      c.ownerId === 'p2' ? { ...c, position: { ...p1Captain.position } } : c,
    )
    const node = { id: 'res-0', kind: 'timber', position: { ...p1Captain.position } } as const

    let contested: GameState = { ...base, captains, resourceNodes: [{ ...node, ownerSeat: 1 }] }
    contested = applyAction(contested, { type: 'endTurn', playerId: 'p1' })
    contested = applyAction(contested, { type: 'endTurn', playerId: 'p2' }) // wrap -> round 2
    expect(contested.players.find((p) => p.id === 'p2')!.resources.timber).toBe(3)
    expect(contested.players[0]!.resources.timber).toBe(0)

    let neutral: GameState = { ...base, captains, resourceNodes: [{ ...node }] }
    neutral = applyAction(neutral, { type: 'endTurn', playerId: 'p1' })
    neutral = applyAction(neutral, { type: 'endTurn', playerId: 'p2' }) // wrap -> round 2
    expect(neutral.players[0]!.resources.timber).toBe(3)
    expect(neutral.players.find((p) => p.id === 'p2')!.resources.timber).toBe(0)
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

  it('sums income, resets builds, and unions vision across every owned city (#373)', () => {
    const base = createGame(econConfig())
    // Hand p2's capital to p1 so p1 fields two cities. p2 keeps its captain, so
    // it stays in play — this isolates the multi-city economy from elimination.
    const twoCity: GameState = {
      ...base,
      cities: base.cities.map((c) => (c.id === 'p2-capital' ? { ...c, ownerId: 'p1' } : c)),
    }
    const cityA = twoCity.cities.find((c) => c.id === 'p1-capital')!
    const cityB = twoCity.cities.find((c) => c.id === 'p2-capital')!

    // Vision is the union of both cities' discs, not just the first.
    const visible = new Set(currentlyVisibleTiles(twoCity, 'p1').map(tileKey))
    expect(visible.has(tileKey(cityA.position))).toBe(true)
    expect(visible.has(tileKey(cityB.position))).toBe(true)

    // Both cities can build in the same turn (the one-build rule is per city).
    let state = applyAction(twoCity, {
      type: 'construct',
      playerId: 'p1',
      cityId: 'p1-capital',
      buildingId: 'sawmill',
    })
    state = applyAction(state, {
      type: 'construct',
      playerId: 'p1',
      cityId: 'p2-capital',
      buildingId: 'sawmill',
    })
    expect(state.cities.filter((c) => c.ownerId === 'p1').every((c) => c.builtThisRound)).toBe(true)

    const startGold = state.players.find((p) => p.id === 'p1')!.resources.gold
    state = applyAction(state, { type: 'endTurn', playerId: 'p1' })
    state = applyAction(state, { type: 'endTurn', playerId: 'p2' }) // wrap -> round 2

    // Two townhalls' income (100 gold each) is counted, not one.
    expect(state.players.find((p) => p.id === 'p1')!.resources.gold).toBe(startGold + 200)
    // The round wrap clears builtThisRound on every owned city, not just one.
    expect(state.cities.filter((c) => c.ownerId === 'p1').every((c) => !c.builtThisRound)).toBe(
      true,
    )
  })

  it('replays two-city builds and income identically (#373)', () => {
    const base = createGame(econConfig())
    const twoCity: GameState = {
      ...base,
      cities: base.cities.map((c) => (c.id === 'p2-capital' ? { ...c, ownerId: 'p1' } : c)),
    }
    const log: Action[] = [
      { type: 'construct', playerId: 'p1', cityId: 'p1-capital', buildingId: 'sawmill' },
      { type: 'construct', playerId: 'p1', cityId: 'p2-capital', buildingId: 'sawmill' },
      { type: 'recruit', playerId: 'p1', cityId: 'p1-capital', unitId: 'deckhand', count: 2 },
      { type: 'endTurn', playerId: 'p1' },
      { type: 'endTurn', playerId: 'p2' },
    ]
    const a = replay(twoCity, log)
    const b = replay(twoCity, log)
    expect(JSON.stringify(a)).toBe(JSON.stringify(b))
    expect(a.actionCount).toBe(log.length)
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

  it('replays identically on a generated hex map (#389)', () => {
    const config = (): GameConfig => ({ ...testConfig(3), topology: 'hex' })
    const log: Action[] = [
      { type: 'endTurn', playerId: 'p1' },
      { type: 'endTurn', playerId: 'p2' },
      { type: 'endTurn', playerId: 'p3' },
      { type: 'endTurn', playerId: 'p1' },
    ]
    const a = replay(createGame(config()), log)
    const b = replay(createGame(config()), log)
    expect(a.map.topology).toBe('hex')
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

  it('replays a resource-node-controlled economy (#101) identically across two runs', () => {
    const base = createGame(econConfig())
    const captain = captainsOf(base, 'p1')[0]!
    const withNode: GameState = {
      ...base,
      resourceNodes: [{ id: 'res-0', kind: 'gold', position: { ...captain.position } }],
    }
    const log: Action[] = [
      { type: 'endTurn', playerId: 'p1' },
      { type: 'endTurn', playerId: 'p2' },
      { type: 'endTurn', playerId: 'p1' },
      { type: 'endTurn', playerId: 'p2' },
    ]
    const a = replay(withNode, log)
    const b = replay(withNode, log)
    expect(JSON.stringify(a)).toBe(JSON.stringify(b))
    // Two round wraps, each granting the gold node's 50 on top of the 100 from townhall.
    expect(a.players[0]!.resources.gold).toBe(withNode.players[0]!.resources.gold + 2 * (100 + 50))
  })
})

// --- Multi-turn sail orders (#372) -------------------------------------------

/** A 14×5 sheet of open deep water — no land, so every water path is unobstructed. */
function openSea(width: number, height: number): GameMap {
  const tiles = Array.from({ length: width * height }, () => ({
    type: 'deep' as const,
    island: -1,
  }))
  return { width, height, tiles, startPositions: [] }
}

interface CapSpec {
  id: string
  ownerId: string
  position: Coord
}

/**
 * A handcrafted two-seat GameState on open water for sail-order tests: precise
 * captain placement (which the procedural generator can't give us) with p1 as
 * the human seat to act. `setup` defaults to GAME_SETUP (vision radius 2).
 */
function sailState(
  caps: CapSpec[],
  currentPlayerIndex = 0,
  setup: GameSetup = GAME_SETUP,
  map: GameMap = openSea(14, 5),
): GameState {
  const seats = [
    { id: 'p1', name: 'One', faction: 'pirates' as const, isAI: false },
    { id: 'p2', name: 'Two', faction: 'british' as const, isAI: true },
  ]
  const captains: Captain[] = caps.map((c) => ({
    id: c.id,
    ownerId: c.ownerId,
    name: c.id,
    position: { ...c.position },
    shipClassId: 'sloop',
    movementPoints: setup.startingCaptainMovement,
    maxMovementPoints: setup.startingCaptainMovement,
    troops: [],
    xp: 0,
    skills: [],
    shipUpgrades: {},
    captured: false,
  }))
  return {
    config: { seed: 1, mapSize: 'small', setup, players: seats, rulesVersion: RULES_VERSION },
    map,
    round: 1,
    currentPlayerIndex,
    players: seats.map((s) => ({
      id: s.id,
      name: s.name,
      faction: s.faction,
      isAI: s.isAI,
      resources: { gold: 0, timber: 0, iron: 0, rum: 0 },
      eliminated: false,
      reputation: 100,
    })),
    alliances: { pairs: [], proposals: [] },
    cities: [],
    captains,
    encounters: [],
    resourceNodes: [],
    exploredTiles: {},
    rngState: seedRng(1),
    actionCount: 0,
    status: 'active',
    winnerId: null,
  }
}

const captainById = (state: GameState, id: string): Captain =>
  state.captains.find((c) => c.id === id)!

/** End p1's then p2's turn, returning to p1 with its sail orders auto-continued. */
function roundTripTurn(state: GameState): GameState {
  const afterP1 = applyAction(state, { type: 'endTurn', playerId: 'p1' })
  return applyAction(afterP1, { type: 'endTurn', playerId: 'p2' })
}

describe('multi-turn sail orders (#372)', () => {
  it('auto-continues across turns and clears the order on arrival', () => {
    let state = sailState([
      { id: 'p1cap', ownerId: 'p1', position: { x: 1, y: 2 } },
      { id: 'p2cap', ownerId: 'p2', position: { x: 13, y: 0 } }, // far, never sighted
    ])
    state = applyAction(state, {
      type: 'setSailOrder',
      playerId: 'p1',
      captainId: 'p1cap',
      destination: { x: 9, y: 2 },
    })
    // First leg spends all 5 movement points (cost is 8) — still under way.
    const afterLeg1 = captainById(state, 'p1cap')
    expect(afterLeg1.movementPoints).toBe(0)
    expect(afterLeg1.position.x).toBe(6)
    expect(afterLeg1.sailOrder?.destination).toEqual({ x: 9, y: 2 })
    expect(afterLeg1.sailOrder?.interrupted).toBeUndefined()

    // Next turn it finishes the remaining 3 tiles and the order is consumed.
    state = roundTripTurn(state)
    const arrived = captainById(state, 'p1cap')
    expect(arrived.position).toEqual({ x: 9, y: 2 })
    expect(arrived.sailOrder).toBeUndefined()
  })

  it('pauses mid-sail the step an unseen enemy comes into view (own movement reveals it)', () => {
    let state = sailState([
      { id: 'p1cap', ownerId: 'p1', position: { x: 1, y: 2 } },
      { id: 'p2cap', ownerId: 'p2', position: { x: 6, y: 2 } }, // ahead, unseen at start
    ])
    state = applyAction(state, {
      type: 'setSailOrder',
      playerId: 'p1',
      captainId: 'p1cap',
      destination: { x: 11, y: 2 },
    })
    const cap = captainById(state, 'p1cap')
    // The enemy at (6,2) enters vision-2 range exactly when the ship reaches x=4
    // (3 steps), so it stops there, paused, having spent 3 of 5 points.
    expect(cap.position.x).toBe(4)
    expect(cap.movementPoints).toBe(2)
    expect(cap.sailOrder?.interrupted).toBe(true)
    expect(cap.sailOrder?.knownContactIds).toContain('p2cap')
  })

  it('does not pause for a contact already sighted when the order was set', () => {
    let state = sailState([
      { id: 'p1cap', ownerId: 'p1', position: { x: 1, y: 2 } },
      { id: 'p2cap', ownerId: 'p2', position: { x: 2, y: 2 } }, // adjacent, already in view
    ])
    state = applyAction(state, {
      type: 'setSailOrder',
      playerId: 'p1',
      captainId: 'p1cap',
      destination: { x: 11, y: 2 },
    })
    // A known contact never triggers the pause — it sails the full 5-tile leg
    // (its knownContactIds then reflect the end-of-leg view, where p2 is behind).
    const cap = captainById(state, 'p1cap')
    expect(cap.position.x).toBe(6)
    expect(cap.movementPoints).toBe(0)
    expect(cap.sailOrder?.interrupted).toBeUndefined()
  })

  it('pauses when an enemy moves into view between turns (no stray step)', () => {
    let state = sailState([
      { id: 'p1cap', ownerId: 'p1', position: { x: 1, y: 2 } },
      { id: 'p2cap', ownerId: 'p2', position: { x: 10, y: 2 } },
    ])
    state = applyAction(state, {
      type: 'setSailOrder',
      playerId: 'p1',
      captainId: 'p1cap',
      destination: { x: 11, y: 2 },
    })
    const stopped = { ...captainById(state, 'p1cap').position }
    expect(captainById(state, 'p1cap').sailOrder?.interrupted).toBeUndefined()

    // p2 sails its ship within vision range of p1's paused-for-the-turn position.
    state = applyAction(state, { type: 'endTurn', playerId: 'p1' })
    state = applyAction(state, {
      type: 'moveCaptain',
      playerId: 'p2',
      captainId: 'p2cap',
      to: { x: 7, y: 2 },
    })
    state = applyAction(state, { type: 'endTurn', playerId: 'p2' })

    // On p1's new turn the fresh contact pauses the order before moving a tile.
    const cap = captainById(state, 'p1cap')
    expect(cap.position).toEqual(stopped)
    expect(cap.movementPoints).toBe(GAME_SETUP.startingCaptainMovement)
    expect(cap.sailOrder?.interrupted).toBe(true)
    expect(cap.sailOrder?.knownContactIds).toContain('p2cap')
  })

  it('re-aims an intercept at the target’s live position each turn', () => {
    // Wide vision: the target is always in sight (hence always a known contact),
    // so the ship never pauses and we can watch it track a moving quarry.
    const setup: GameSetup = { ...GAME_SETUP, captainVisionRadius: 20 }
    let state = sailState(
      [
        { id: 'p1cap', ownerId: 'p1', position: { x: 1, y: 2 } },
        { id: 'p2cap', ownerId: 'p2', position: { x: 11, y: 2 } },
      ],
      0,
      setup,
    )
    state = applyAction(state, {
      type: 'setSailOrder',
      playerId: 'p1',
      captainId: 'p1cap',
      destination: { x: 11, y: 2 },
      targetId: 'p2cap',
      targetKind: 'captain',
    })
    // The quarry relocates before p1 closes in.
    state = applyAction(state, { type: 'endTurn', playerId: 'p1' })
    state = applyAction(state, {
      type: 'moveCaptain',
      playerId: 'p2',
      captainId: 'p2cap',
      to: { x: 11, y: 4 },
    })
    state = applyAction(state, { type: 'endTurn', playerId: 'p2' })

    // Give the chase enough turns to close; it ends adjacent to the NEW position
    // (never auto-attacking) and the order is consumed on arrival.
    for (let i = 0; i < 4 && captainById(state, 'p1cap').sailOrder; i++) {
      state = roundTripTurn(state)
    }
    const chaser = captainById(state, 'p1cap')
    expect(chaser.sailOrder).toBeUndefined()
    expect(mapDistance(state.map, chaser.position, { x: 11, y: 4 })).toBeLessThanOrEqual(1)
  })

  it('clears an intercept whose target is captured', () => {
    let state = sailState([
      { id: 'p1cap', ownerId: 'p1', position: { x: 1, y: 2 } },
      { id: 'p2cap', ownerId: 'p2', position: { x: 11, y: 2 } },
    ])
    state = applyAction(state, {
      type: 'setSailOrder',
      playerId: 'p1',
      captainId: 'p1cap',
      destination: { x: 11, y: 2 },
      targetId: 'p2cap',
      targetKind: 'captain',
    })
    expect(captainById(state, 'p1cap').sailOrder?.targetId).toBe('p2cap')

    // Simulate the quarry being captured by someone else, then advance p1's turn.
    state = {
      ...state,
      captains: state.captains.map((c) =>
        c.id === 'p2cap' ? { ...c, captured: true, capturedBy: 'p1' } : c,
      ),
    }
    state = roundTripTurn(state)
    expect(captainById(state, 'p1cap').sailOrder).toBeUndefined()
  })

  it('clearSailOrder and a manual move both cancel a standing order', () => {
    // clearSailOrder cancels an order set this turn (no movement needed).
    const withOrder = applyAction(
      sailState([
        { id: 'p1cap', ownerId: 'p1', position: { x: 1, y: 2 } },
        { id: 'p2cap', ownerId: 'p2', position: { x: 13, y: 0 } },
      ]),
      { type: 'setSailOrder', playerId: 'p1', captainId: 'p1cap', destination: { x: 9, y: 2 } },
    )
    const cleared = applyAction(withOrder, {
      type: 'clearSailOrder',
      playerId: 'p1',
      captainId: 'p1cap',
    })
    expect(captainById(cleared, 'p1cap').sailOrder).toBeUndefined()

    // A manual move overrides a paused order while movement remains (the mid-sail
    // interrupt leaves points unspent).
    const paused = applyAction(
      sailState([
        { id: 'p1cap', ownerId: 'p1', position: { x: 1, y: 2 } },
        { id: 'p2cap', ownerId: 'p2', position: { x: 6, y: 2 } },
      ]),
      { type: 'setSailOrder', playerId: 'p1', captainId: 'p1cap', destination: { x: 11, y: 2 } },
    )
    const pausedCap = captainById(paused, 'p1cap')
    expect(pausedCap.sailOrder?.interrupted).toBe(true)
    expect(pausedCap.movementPoints).toBeGreaterThan(0)
    const moved = applyAction(paused, {
      type: 'moveCaptain',
      playerId: 'p1',
      captainId: 'p1cap',
      to: { x: pausedCap.position.x - 1, y: pausedCap.position.y },
    })
    expect(captainById(moved, 'p1cap').sailOrder).toBeUndefined()
  })

  it('rejects malformed sail orders', () => {
    const state = sailState([
      { id: 'p1cap', ownerId: 'p1', position: { x: 1, y: 2 } },
      { id: 'p2cap', ownerId: 'p2', position: { x: 2, y: 2 } },
    ])
    // Off-map destination.
    expect(() =>
      applyAction(state, {
        type: 'setSailOrder',
        playerId: 'p1',
        captainId: 'p1cap',
        destination: { x: 99, y: 0 },
      }),
    ).toThrow(InvalidActionError)
    // Destination is the captain's own tile.
    expect(() =>
      applyAction(state, {
        type: 'setSailOrder',
        playerId: 'p1',
        captainId: 'p1cap',
        destination: { x: 1, y: 2 },
      }),
    ).toThrow(InvalidActionError)
    // A target id without a target kind.
    expect(() =>
      applyAction(state, {
        type: 'setSailOrder',
        playerId: 'p1',
        captainId: 'p1cap',
        destination: { x: 2, y: 2 },
        targetId: 'p2cap',
      }),
    ).toThrow(InvalidActionError)
    // Intercepting an already-adjacent target.
    expect(() =>
      applyAction(state, {
        type: 'setSailOrder',
        playerId: 'p1',
        captainId: 'p1cap',
        destination: { x: 2, y: 2 },
        targetId: 'p2cap',
        targetKind: 'captain',
      }),
    ).toThrow(InvalidActionError)
  })

  it('rejects a destination in an unreachable sea basin', () => {
    // A solid land wall down column 3 splits the sheet into two seas.
    const walled = openSea(7, 5)
    for (let y = 0; y < 5; y++) walled.tiles[y * 7 + 3] = { type: 'land', island: 0 }
    const state = sailState(
      [
        { id: 'p1cap', ownerId: 'p1', position: { x: 1, y: 2 } },
        { id: 'p2cap', ownerId: 'p2', position: { x: 5, y: 2 } },
      ],
      0,
      GAME_SETUP,
      walled,
    )
    expect(() =>
      applyAction(state, {
        type: 'setSailOrder',
        playerId: 'p1',
        captainId: 'p1cap',
        destination: { x: 5, y: 2 },
      }),
    ).toThrow(InvalidActionError)
  })

  it('replays a sail-order log to a byte-identical state', () => {
    const base = sailState([
      { id: 'p1cap', ownerId: 'p1', position: { x: 1, y: 2 } },
      { id: 'p2cap', ownerId: 'p2', position: { x: 0, y: 4 } },
    ])
    const log: Action[] = [
      { type: 'setSailOrder', playerId: 'p1', captainId: 'p1cap', destination: { x: 13, y: 2 } },
      { type: 'endTurn', playerId: 'p1' },
      { type: 'endTurn', playerId: 'p2' },
      { type: 'endTurn', playerId: 'p1' },
      { type: 'endTurn', playerId: 'p2' },
      { type: 'endTurn', playerId: 'p1' },
      { type: 'endTurn', playerId: 'p2' },
    ]
    expect(JSON.stringify(replay(base, log))).toBe(JSON.stringify(replay(base, log)))
  })

  it('resumes an in-flight sail order from a JSON snapshot at every prefix', () => {
    const base = sailState([
      { id: 'p1cap', ownerId: 'p1', position: { x: 1, y: 2 } },
      { id: 'p2cap', ownerId: 'p2', position: { x: 0, y: 4 } }, // sighted at start → stays known
    ])
    const log: Action[] = [
      { type: 'setSailOrder', playerId: 'p1', captainId: 'p1cap', destination: { x: 13, y: 2 } },
      { type: 'endTurn', playerId: 'p1' },
      { type: 'endTurn', playerId: 'p2' },
      { type: 'endTurn', playerId: 'p1' },
      { type: 'endTurn', playerId: 'p2' },
      { type: 'endTurn', playerId: 'p1' },
      { type: 'endTurn', playerId: 'p2' },
    ]
    const fullJson = JSON.stringify(replay(base, log))
    const roundTrip = (s: GameState): GameState => JSON.parse(JSON.stringify(s)) as GameState

    let stateAtK = base
    for (let k = 0; k <= log.length; k++) {
      const resumed = replay(roundTrip(stateAtK), log.slice(k))
      expect(JSON.stringify(resumed)).toBe(fullJson)
      if (k < log.length) stateAtK = applyAction(stateAtK, log[k]!)
    }
  })
})
