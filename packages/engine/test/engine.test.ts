import { MAP_DIMENSIONS } from '@aop/shared'
import { describe, expect, it } from 'vitest'
import {
  applyAction,
  availableSkillPicks,
  boostedCatalog,
  captainCombatBonus,
  createGame,
  currentlyVisibleTiles,
  currentPlayer,
  decideEngagement,
  effectiveShipStats,
  estimateOdds,
  InvalidActionError,
  levelForXp,
  nextFloat,
  nextInt,
  nextUpgradeCost,
  replay,
  resolveCombat,
  resolveEncounter,
  seedRng,
  tilesInRadius,
  visibleState,
  type Action,
  type ContentCatalog,
  type GameConfig,
} from '../src'

const testCatalog: ContentCatalog = {
  buildings: {
    townhall: { produces: { gold: 100 }, cost: {} },
    sawmill: { produces: { timber: 4 }, cost: { gold: 200 }, requires: 'townhall' },
    barracks: { produces: {}, cost: { gold: 150 }, requires: 'townhall', unlocksTier: 1 },
    shipyard: { produces: {}, cost: { gold: 300, timber: 20 }, requires: 'townhall' },
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
      health: 24,
    },
    sailor: {
      factionId: 'british',
      tier: 1,
      goldCost: 30,
      weeklyGrowth: 8,
      attack: 3,
      defense: 1,
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
        hull: [{ goldCost: 150, amount: 15 }],
        crewCapacity: [{ goldCost: 220, amount: 1 }],
      },
    },
  },
  skills: {
    'pirates-gunnery-1': {
      factionId: 'pirates',
      tier: 1,
      attackBonusPct: 10,
      defenseBonusPct: 0,
    },
    'pirates-navigation-1': {
      factionId: 'pirates',
      tier: 2,
      attackBonusPct: 0,
      defenseBonusPct: 10,
    },
    'british-gunnery-1': {
      factionId: 'british',
      tier: 1,
      attackBonusPct: 12,
      defenseBonusPct: 0,
    },
  },
  captainXpThresholds: [0, 150, 400, 800, 1400],
}

function testConfig(playerCount = 3): GameConfig {
  const factions = ['pirates', 'british', 'spanish', 'dutch'] as const
  return {
    seed: 42,
    mapSize: 'small',
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

    state = applyAction(state, { type: 'endTurn', playerId: 'p1' }, testCatalog)
    expect(currentPlayer(state).id).toBe('p2')
    expect(state.round).toBe(1)

    state = applyAction(state, { type: 'endTurn', playerId: 'p2' }, testCatalog)
    state = applyAction(state, { type: 'endTurn', playerId: 'p3' }, testCatalog)
    expect(currentPlayer(state).id).toBe('p1')
    expect(state.round).toBe(2)
  })

  it('rejects out-of-turn actions', () => {
    const state = createGame(testConfig(3))
    expect(() => applyAction(state, { type: 'endTurn', playerId: 'p2' }, testCatalog)).toThrow(
      InvalidActionError,
    )
  })

  it('skips eliminated players', () => {
    let state = createGame(testConfig(3))
    state = applyAction(state, { type: 'endTurn', playerId: 'p1' }, testCatalog)
    state = applyAction(state, { type: 'resign', playerId: 'p2' }, testCatalog)
    expect(currentPlayer(state).id).toBe('p3')
    state = applyAction(state, { type: 'endTurn', playerId: 'p3' }, testCatalog)
    state = applyAction(state, { type: 'endTurn', playerId: 'p1' }, testCatalog)
    expect(currentPlayer(state).id).toBe('p3')
  })

  it('finishes the game when one player remains', () => {
    let state = createGame(testConfig(3))
    state = applyAction(state, { type: 'resign', playerId: 'p1' }, testCatalog)
    expect(state.status).toBe('active')
    state = applyAction(state, { type: 'resign', playerId: 'p2' }, testCatalog)
    expect(state.status).toBe('finished')
    expect(state.winnerId).toBe('p3')
    expect(() => applyAction(state, { type: 'endTurn', playerId: 'p3' }, testCatalog)).toThrow(
      InvalidActionError,
    )
  })

  it('does not mutate the input state', () => {
    const state = createGame(testConfig(3))
    const snapshot = JSON.parse(JSON.stringify(state))
    applyAction(state, { type: 'endTurn', playerId: 'p1' }, testCatalog)
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
    const a = replay(createGame(testConfig(3)), log, testCatalog)
    const b = replay(createGame(testConfig(3)), log, testCatalog)
    expect(JSON.stringify(a)).toBe(JSON.stringify(b))
    expect(a.actionCount).toBe(log.length)
  })
})

describe('economy', () => {
  function economyConfig(playerCount = 2): GameConfig {
    return { ...testConfig(playerCount), startingBuildings: ['townhall'] }
  }

  it('gives every player a starting capital with the configured buildings', () => {
    const state = createGame(economyConfig())
    expect(state.cities).toHaveLength(2)
    expect(state.cities[0]).toMatchObject({ ownerId: 'p1', buildings: ['townhall'] })
  })

  it('applies city income to every living player once the round advances', () => {
    let state = createGame(economyConfig())
    const before = state.players.map((p) => p.resources.gold)

    state = applyAction(state, { type: 'endTurn', playerId: 'p1' }, testCatalog)
    // Still round 1: no income yet.
    expect(state.players[0]!.resources.gold).toBe(before[0])

    state = applyAction(state, { type: 'endTurn', playerId: 'p2' }, testCatalog)
    // Round wrapped: townhall's 100 gold applied to both players.
    expect(state.players[0]!.resources.gold).toBe(before[0]! + 100)
    expect(state.players[1]!.resources.gold).toBe(before[1]! + 100)
  })

  it('does not pay income to eliminated players', () => {
    let state = createGame(economyConfig(3))
    state = applyAction(state, { type: 'resign', playerId: 'p1' }, testCatalog)
    const goldAfterResign = state.players[0]!.resources.gold
    state = applyAction(state, { type: 'endTurn', playerId: 'p2' }, testCatalog)
    state = applyAction(state, { type: 'endTurn', playerId: 'p3' }, testCatalog)
    expect(state.players[0]!.resources.gold).toBe(goldAfterResign)
    expect(state.players[1]!.resources.gold).toBeGreaterThan(goldAfterResign)
  })
})

describe('construct', () => {
  function economyConfig(playerCount = 2): GameConfig {
    return { ...testConfig(playerCount), startingBuildings: ['townhall'] }
  }

  it('builds a building, charges its cost, and marks the city as built this round', () => {
    let state = createGame(economyConfig())
    const city = state.cities[0]!
    state = applyAction(
      state,
      { type: 'construct', playerId: 'p1', cityId: city.id, buildingId: 'sawmill' },
      testCatalog,
    )
    const updated = state.cities.find((c) => c.id === city.id)!
    expect(updated.buildings).toContain('sawmill')
    expect(updated.builtThisRound).toBe(true)
    expect(state.players[0]!.resources.gold).toBe(1000 - 200)
  })

  it('rejects a second build in the same city before the round wraps', () => {
    let state = createGame(economyConfig())
    const city = state.cities[0]!
    state = applyAction(
      state,
      { type: 'construct', playerId: 'p1', cityId: city.id, buildingId: 'sawmill' },
      testCatalog,
    )
    expect(() =>
      applyAction(
        state,
        { type: 'construct', playerId: 'p1', cityId: city.id, buildingId: 'sawmill' },
        testCatalog,
      ),
    ).toThrow(InvalidActionError)
  })

  it('rejects a building whose prerequisite is missing', () => {
    const state = createGame({ ...economyConfig(), startingBuildings: [] })
    const city = state.cities[0]!
    expect(() =>
      applyAction(
        state,
        { type: 'construct', playerId: 'p1', cityId: city.id, buildingId: 'sawmill' },
        testCatalog,
      ),
    ).toThrow(InvalidActionError)
  })

  it('rejects construction the player cannot afford', () => {
    const richCatalog: ContentCatalog = {
      ...testCatalog,
      buildings: { ...testCatalog.buildings, expensive: { produces: {}, cost: { gold: 999999 } } },
    }
    const state = createGame(economyConfig())
    const city = state.cities[0]!
    expect(() =>
      applyAction(
        state,
        { type: 'construct', playerId: 'p1', cityId: city.id, buildingId: 'expensive' },
        richCatalog,
      ),
    ).toThrow(InvalidActionError)
  })

  it('lets each city build again after the round wraps', () => {
    let state = createGame(economyConfig())
    const city = state.cities[0]!
    state = applyAction(
      state,
      { type: 'construct', playerId: 'p1', cityId: city.id, buildingId: 'sawmill' },
      testCatalog,
    )
    state = applyAction(state, { type: 'endTurn', playerId: 'p1' }, testCatalog)
    state = applyAction(state, { type: 'endTurn', playerId: 'p2' }, testCatalog)
    const updated = state.cities.find((c) => c.id === city.id)!
    expect(updated.builtThisRound).toBe(false)
  })
})

describe('recruit & garrisons', () => {
  function recruitConfig(): GameConfig {
    return {
      ...testConfig(2),
      startingBuildings: ['townhall', 'barracks'],
      startingShipClassId: 'sloop',
    }
  }

  it('replenishes availability for the owner faction only, gated by unlocked tier', () => {
    let state = createGame(recruitConfig())
    state = applyAction(state, { type: 'endTurn', playerId: 'p1' }, testCatalog)
    state = applyAction(state, { type: 'endTurn', playerId: 'p2' }, testCatalog)
    const p1City = state.cities.find((c) => c.ownerId === 'p1')!
    // p1 is pirates: deckhand (tier 1, unlocked) grows, buccaneer (tier 3, locked) does not.
    expect(p1City.unitAvailability.deckhand).toBe(8)
    expect(p1City.unitAvailability.buccaneer).toBeUndefined()
  })

  it('recruits units into the garrison, spending gold and available recruits', () => {
    let state = createGame(recruitConfig())
    state = applyAction(state, { type: 'endTurn', playerId: 'p1' }, testCatalog)
    state = applyAction(state, { type: 'endTurn', playerId: 'p2' }, testCatalog)
    const city = state.cities.find((c) => c.ownerId === 'p1')!
    state = applyAction(
      state,
      { type: 'recruit', playerId: 'p1', cityId: city.id, unitId: 'deckhand', count: 3 },
      testCatalog,
    )
    const updated = state.cities.find((c) => c.id === city.id)!
    expect(updated.garrison.deckhand).toBe(3)
    expect(updated.unitAvailability.deckhand).toBe(5)
    // Starting gold 1000, +100 townhall income when the round wraps, -75 for 3 deckhands.
    expect(state.players[0]!.resources.gold).toBe(1000 + 100 - 3 * 25)
  })

  it('rejects recruiting more than is available or a unit from another faction', () => {
    let state = createGame(recruitConfig())
    state = applyAction(state, { type: 'endTurn', playerId: 'p1' }, testCatalog)
    state = applyAction(state, { type: 'endTurn', playerId: 'p2' }, testCatalog)
    const city = state.cities.find((c) => c.ownerId === 'p1')!
    expect(() =>
      applyAction(
        state,
        { type: 'recruit', playerId: 'p1', cityId: city.id, unitId: 'deckhand', count: 99 },
        testCatalog,
      ),
    ).toThrow(InvalidActionError)
    expect(() =>
      applyAction(
        state,
        { type: 'recruit', playerId: 'p1', cityId: city.id, unitId: 'sailor', count: 1 },
        testCatalog,
      ),
    ).toThrow(InvalidActionError)
  })

  it('transfers troops between the garrison and a captain, respecting crew capacity', () => {
    let state = createGame(recruitConfig())
    state = applyAction(state, { type: 'endTurn', playerId: 'p1' }, testCatalog)
    state = applyAction(state, { type: 'endTurn', playerId: 'p2' }, testCatalog)
    const city = state.cities.find((c) => c.ownerId === 'p1')!
    const captain = state.captains.find((c) => c.ownerId === 'p1')!
    state = applyAction(
      state,
      { type: 'recruit', playerId: 'p1', cityId: city.id, unitId: 'deckhand', count: 4 },
      testCatalog,
    )
    state = applyAction(
      state,
      {
        type: 'transferTroops',
        playerId: 'p1',
        cityId: city.id,
        captainId: captain.id,
        direction: 'toShip',
        unitId: 'deckhand',
        count: 4,
      },
      testCatalog,
    )
    expect(state.captains.find((c) => c.id === captain.id)!.troopsAboard.deckhand).toBe(4)
    expect(state.cities.find((c) => c.id === city.id)!.garrison.deckhand).toBe(0)

    // Sloop crew capacity is 4 — a 5th deckhand won't fit.
    state = applyAction(
      state,
      { type: 'recruit', playerId: 'p1', cityId: city.id, unitId: 'deckhand', count: 1 },
      testCatalog,
    )
    expect(() =>
      applyAction(
        state,
        {
          type: 'transferTroops',
          playerId: 'p1',
          cityId: city.id,
          captainId: captain.id,
          direction: 'toShip',
          unitId: 'deckhand',
          count: 1,
        },
        testCatalog,
      ),
    ).toThrow(InvalidActionError)

    // And it can come back off the ship into the garrison.
    state = applyAction(
      state,
      {
        type: 'transferTroops',
        playerId: 'p1',
        cityId: city.id,
        captainId: captain.id,
        direction: 'toGarrison',
        unitId: 'deckhand',
        count: 2,
      },
      testCatalog,
    )
    expect(state.captains.find((c) => c.id === captain.id)!.troopsAboard.deckhand).toBe(2)
    expect(state.cities.find((c) => c.id === city.id)!.garrison.deckhand).toBe(3)
  })
})

describe('visibility', () => {
  it('places every starting city within the map bounds, deterministically for the same seed', () => {
    const a = createGame(testConfig(4))
    const b = createGame(testConfig(4))
    expect(a.cities.map((c) => c.position)).toEqual(b.cities.map((c) => c.position))

    const { width, height } = MAP_DIMENSIONS[a.config.mapSize]
    for (const city of a.cities) {
      expect(city.position.x).toBeGreaterThanOrEqual(0)
      expect(city.position.x).toBeLessThan(width)
      expect(city.position.y).toBeGreaterThanOrEqual(0)
      expect(city.position.y).toBeLessThan(height)
    }
  })

  it('tilesInRadius clips to the map edge instead of returning out-of-bounds tiles', () => {
    const tiles = tilesInRadius({ x: 0, y: 0 }, 2, 'small')
    expect(tiles.every((t) => t.x >= 0 && t.y >= 0)).toBe(true)
    expect(tiles).toContainEqual({ x: 0, y: 0 })
    expect(tiles).toContainEqual({ x: 2, y: 2 })
  })

  it('sees only tiles around its own cities, not an opponent city', () => {
    const state = createGame(testConfig(2))
    const p1City = state.cities.find((c) => c.ownerId === 'p1')!
    const p2City = state.cities.find((c) => c.ownerId === 'p2')!

    const p1Visible = currentlyVisibleTiles(state, 'p1')
    expect(p1Visible).toContainEqual(p1City.position)
    expect(p1Visible).not.toContainEqual(p2City.position)
  })

  it('accumulates explored tiles across turns and keeps them after they leave current view', () => {
    let state = createGame(testConfig(2))
    const before = visibleState(state, 'p1')
    expect(before.explored.length).toBeGreaterThan(0)
    expect(before.explored).toEqual(expect.arrayContaining(before.visible))

    state = applyAction(state, { type: 'endTurn', playerId: 'p1' }, testCatalog)
    state = applyAction(state, { type: 'endTurn', playerId: 'p2' }, testCatalog)

    // Static cities mean currently-visible tiles don't change round to round,
    // but every visible tile must still show up as explored history too.
    const after = visibleState(state, 'p1')
    expect(after.explored).toEqual(expect.arrayContaining(after.visible))
    expect(state.exploredTiles.p1!.length).toBe(after.explored.length)
  })
})

describe('combat', () => {
  it('resolveCombat is a pure, deterministic function of its inputs', () => {
    const [, a] = resolveCombat({ deckhand: 5 }, { sailor: 5 }, testCatalog, seedRng(99))
    const [, b] = resolveCombat({ deckhand: 5 }, { sailor: 5 }, testCatalog, seedRng(99))
    expect(a).toEqual(b)
  })

  it('declares a winner (or draw) and never lets losses exceed the starting army', () => {
    const [, result] = resolveCombat({ deckhand: 6 }, { buccaneer: 2 }, testCatalog, seedRng(7))
    expect(['attacker', 'defender', 'draw']).toContain(result.winner)
    expect(result.attackerLosses.deckhand ?? 0).toBeLessThanOrEqual(6)
    expect(result.defenderLosses.buccaneer ?? 0).toBeLessThanOrEqual(2)
    expect((result.attackerSurvivors.deckhand ?? 0) + (result.attackerLosses.deckhand ?? 0)).toBe(6)
  })

  it('advances the returned RngState so repeated battles do not repeat the same rolls', () => {
    const [stateAfterFirst] = resolveCombat({ deckhand: 3 }, { sailor: 3 }, testCatalog, seedRng(1))
    expect(stateAfterFirst).not.toBe(seedRng(1))
  })

  it('estimateOdds is deterministic for the same scratch seed and takes no GameState RngState', () => {
    // estimateOdds only ever accepts a plain scratchSeed number, never the
    // GameState's RngState — Monte Carlo trials can never advance game RNG.
    const a = estimateOdds({ deckhand: 4 }, { sailor: 4 }, testCatalog, 12345, 50)
    const b = estimateOdds({ deckhand: 4 }, { sailor: 4 }, testCatalog, 12345, 50)
    expect(a).toEqual(b)
  })

  it('estimateOdds gives the overwhelmingly stronger side a near-certain win', () => {
    const odds = estimateOdds({ buccaneer: 10 }, { sailor: 1 }, testCatalog, 2024, 50)
    expect(odds.attackerWinProbability).toBeGreaterThan(0.9)
    expect(odds.attackerWinProbability + odds.defenderWinProbability + odds.drawProbability).toBe(1)
  })
})

describe('standing orders', () => {
  it('fightToTheShip always engages, regardless of power difference', () => {
    const decision = decideEngagement(100, 1, 'fightToTheShip')
    expect(decision).toEqual({ engage: true, reason: 'standard' })
  })

  it('evadeIfOutgunned evades only when the attacker has more raw power', () => {
    expect(decideEngagement(100, 1, 'evadeIfOutgunned')).toEqual({
      engage: false,
      reason: 'outgunned',
    })
    expect(decideEngagement(1, 100, 'evadeIfOutgunned')).toEqual({
      engage: true,
      reason: 'standard',
    })
  })

  it('resolveEncounter skips resolveCombat entirely when the defender evades', () => {
    const [nextRng, outcome] = resolveEncounter(
      { buccaneer: 10 },
      { deckhand: 1 },
      'evadeIfOutgunned',
      testCatalog,
      seedRng(1),
    )
    expect(outcome.decision.engage).toBe(false)
    expect(outcome.combat).toBeUndefined()
    // No combat happened, so the RngState must be untouched.
    expect(nextRng).toEqual(seedRng(1))
  })

  it('resolveEncounter runs the real resolver when the defender stands and fights', () => {
    const [, outcome] = resolveEncounter(
      { deckhand: 5 },
      { sailor: 5 },
      'fightToTheShip',
      testCatalog,
      seedRng(1),
    )
    expect(outcome.decision.engage).toBe(true)
    expect(outcome.combat).toBeDefined()
    expect(['attacker', 'defender', 'draw']).toContain(outcome.combat!.winner)
  })

  it('setStandingOrder persists the order on the owner city and is rejected for non-owners', () => {
    let state = createGame(testConfig(2))
    const city = state.cities.find((c) => c.ownerId === 'p1')!
    state = applyAction(
      state,
      {
        type: 'setStandingOrder',
        playerId: 'p1',
        targetType: 'city',
        targetId: city.id,
        order: 'evadeIfOutgunned',
      },
      testCatalog,
    )
    expect(state.cities.find((c) => c.id === city.id)!.standingOrder).toBe('evadeIfOutgunned')

    // Hand the turn to p2, then have p2 try to set an order on p1's city.
    state = applyAction(state, { type: 'endTurn', playerId: 'p1' }, testCatalog)
    expect(() =>
      applyAction(
        state,
        {
          type: 'setStandingOrder',
          playerId: 'p2',
          targetType: 'city',
          targetId: city.id,
          order: 'fightToTheShip',
        },
        testCatalog,
      ),
    ).toThrow(InvalidActionError)
  })

  it('new cities default to fightToTheShip', () => {
    const state = createGame(testConfig(2))
    expect(state.cities.every((c) => c.standingOrder === 'fightToTheShip')).toBe(true)
  })

  it('setStandingOrder persists the order on the owner captain and is rejected for non-owners', () => {
    let state = createGame({ ...testConfig(2), startingShipClassId: 'sloop' })
    const captain = state.captains.find((c) => c.ownerId === 'p1')!
    expect(captain.standingOrder).toBe('fightToTheShip')

    state = applyAction(
      state,
      {
        type: 'setStandingOrder',
        playerId: 'p1',
        targetType: 'captain',
        targetId: captain.id,
        order: 'evadeIfOutgunned',
      },
      testCatalog,
    )
    expect(state.captains.find((c) => c.id === captain.id)!.standingOrder).toBe('evadeIfOutgunned')

    // Hand the turn to p2, then have p2 try to set an order on p1's captain.
    state = applyAction(state, { type: 'endTurn', playerId: 'p1' }, testCatalog)
    expect(() =>
      applyAction(
        state,
        {
          type: 'setStandingOrder',
          playerId: 'p2',
          targetType: 'captain',
          targetId: captain.id,
          order: 'fightToTheShip',
        },
        testCatalog,
      ),
    ).toThrow(InvalidActionError)
  })

  it('replaying a log with setStandingOrder actions is deterministic', () => {
    const log: Action[] = [
      { type: 'endTurn', playerId: 'p1' },
      { type: 'endTurn', playerId: 'p2' },
    ]
    const base = createGame(testConfig(2))
    const city = base.cities.find((c) => c.ownerId === 'p1')!
    const fullLog: Action[] = [
      {
        type: 'setStandingOrder',
        playerId: 'p1',
        targetType: 'city',
        targetId: city.id,
        order: 'evadeIfOutgunned',
      },
      ...log,
    ]
    const a = replay(base, fullLog, testCatalog)
    const b = replay(base, fullLog, testCatalog)
    expect(JSON.stringify(a)).toBe(JSON.stringify(b))
    expect(a.cities.find((c) => c.id === city.id)!.standingOrder).toBe('evadeIfOutgunned')
  })
})

describe('captain skills', () => {
  const thresholds = testCatalog.captainXpThresholds

  it('new captains start at level 1 with no skills', () => {
    const state = createGame({ ...testConfig(2), startingShipClassId: 'sloop' })
    expect(state.captains.every((c) => c.xp === 0 && c.skills.length === 0)).toBe(true)
    expect(state.captains.every((c) => levelForXp(c.xp, thresholds) === 1)).toBe(true)
  })

  it('levelForXp climbs one level per threshold crossed', () => {
    expect(levelForXp(0, thresholds)).toBe(1)
    expect(levelForXp(149, thresholds)).toBe(1)
    expect(levelForXp(150, thresholds)).toBe(2)
    expect(levelForXp(400, thresholds)).toBe(3)
    expect(levelForXp(100_000, thresholds)).toBe(thresholds.length)
  })

  it('availableSkillPicks accounts for skills already spent', () => {
    let state = createGame({ ...testConfig(2), startingShipClassId: 'sloop' })
    let captain = state.captains.find((c) => c.ownerId === 'p1')!
    expect(availableSkillPicks(captain, thresholds)).toBe(0)

    state = applyAction(
      state,
      { type: 'gainCaptainXp', playerId: 'p1', captainId: captain.id, amount: 150 },
      testCatalog,
    )
    captain = state.captains.find((c) => c.id === captain.id)!
    expect(levelForXp(captain.xp, thresholds)).toBe(2)
    expect(availableSkillPicks(captain, thresholds)).toBe(1)

    state = applyAction(
      state,
      {
        type: 'chooseCaptainSkill',
        playerId: 'p1',
        captainId: captain.id,
        skillId: 'pirates-gunnery-1',
      },
      testCatalog,
    )
    captain = state.captains.find((c) => c.id === captain.id)!
    expect(captain.skills).toEqual(['pirates-gunnery-1'])
    expect(availableSkillPicks(captain, thresholds)).toBe(0)
  })

  it('chooseCaptainSkill rejects skills the captain has not leveled into, other factions, and repeats', () => {
    let state = applyAction(
      createGame({ ...testConfig(2), startingShipClassId: 'sloop' }),
      {
        type: 'gainCaptainXp',
        playerId: 'p1',
        captainId: 'p1-flagship',
        amount: 150,
      },
      testCatalog,
    )

    // Wrong faction's skill tree.
    expect(() =>
      applyAction(
        state,
        {
          type: 'chooseCaptainSkill',
          playerId: 'p1',
          captainId: 'p1-flagship',
          skillId: 'british-gunnery-1',
        },
        testCatalog,
      ),
    ).toThrow(InvalidActionError)

    state = applyAction(
      state,
      {
        type: 'chooseCaptainSkill',
        playerId: 'p1',
        captainId: 'p1-flagship',
        skillId: 'pirates-gunnery-1',
      },
      testCatalog,
    )
    expect(() =>
      applyAction(
        state,
        {
          type: 'chooseCaptainSkill',
          playerId: 'p1',
          captainId: 'p1-flagship',
          skillId: 'pirates-gunnery-1',
        },
        testCatalog,
      ),
    ).toThrow(InvalidActionError)
  })

  it('captainCombatBonus sums only the chosen skills, and boostedCatalog scopes the bonus to that faction', () => {
    let state = applyAction(
      createGame({ ...testConfig(2), startingShipClassId: 'sloop' }),
      { type: 'gainCaptainXp', playerId: 'p1', captainId: 'p1-flagship', amount: 150 },
      testCatalog,
    )
    state = applyAction(
      state,
      {
        type: 'chooseCaptainSkill',
        playerId: 'p1',
        captainId: 'p1-flagship',
        skillId: 'pirates-gunnery-1',
      },
      testCatalog,
    )
    const captain = state.captains.find((c) => c.id === 'p1-flagship')!
    const bonus = captainCombatBonus(captain, testCatalog)
    expect(bonus).toEqual({ attackBonusPct: 10, defenseBonusPct: 0 })

    const boosted = boostedCatalog(testCatalog, bonus, 'pirates')
    expect(boosted.units.deckhand!.attack).toBe(
      Math.round(testCatalog.units.deckhand!.attack * 1.1),
    )
    // Other factions' units pass through untouched.
    expect(boosted.units.sailor!.attack).toBe(testCatalog.units.sailor!.attack)
    // No bonus -> same catalog reference, no wasted allocation.
    expect(boostedCatalog(testCatalog, { attackBonusPct: 0, defenseBonusPct: 0 }, 'pirates')).toBe(
      testCatalog,
    )
  })

  it('replaying a log with gainCaptainXp and chooseCaptainSkill actions is deterministic', () => {
    const base = createGame({ ...testConfig(2), startingShipClassId: 'sloop' })
    const log: Action[] = [
      { type: 'gainCaptainXp', playerId: 'p1', captainId: 'p1-flagship', amount: 150 },
      {
        type: 'chooseCaptainSkill',
        playerId: 'p1',
        captainId: 'p1-flagship',
        skillId: 'pirates-gunnery-1',
      },
      { type: 'endTurn', playerId: 'p1' },
    ]
    const a = replay(base, log, testCatalog)
    const b = replay(base, log, testCatalog)
    expect(JSON.stringify(a)).toBe(JSON.stringify(b))
    const captain = a.captains.find((c) => c.id === 'p1-flagship')!
    expect(captain.xp).toBe(150)
    expect(captain.skills).toEqual(['pirates-gunnery-1'])
  })
})

describe('ship upgrades', () => {
  function shipyardConfig(playerCount = 2): GameConfig {
    return {
      ...testConfig(playerCount),
      startingBuildings: ['townhall', 'shipyard'],
      startingShipClassId: 'sloop',
    }
  }

  it('effectiveShipStats applies purchased levels and leaves the base ship class untouched', () => {
    const ship = testCatalog.ships.sloop!
    expect(effectiveShipStats(ship, {})).toEqual({
      hull: 40,
      cannons: 6,
      speed: 5,
      crewCapacity: 4,
    })
    expect(effectiveShipStats(ship, { hull: 1, crewCapacity: 1 })).toEqual({
      hull: 55,
      cannons: 6,
      speed: 5,
      crewCapacity: 5,
    })
  })

  it('nextUpgradeCost returns undefined once a track is maxed or unknown', () => {
    const ship = testCatalog.ships.sloop!
    expect(nextUpgradeCost(ship, 'hull', 0)).toBe(150)
    expect(nextUpgradeCost(ship, 'hull', 1)).toBeUndefined()
    expect(nextUpgradeCost(ship, 'speed', 0)).toBeUndefined()
  })

  it('upgradeShip charges gold and increments the track level', () => {
    let state = createGame(shipyardConfig())
    const city = state.cities.find((c) => c.ownerId === 'p1')!
    const goldBefore = state.players[0]!.resources.gold
    state = applyAction(
      state,
      {
        type: 'upgradeShip',
        playerId: 'p1',
        cityId: city.id,
        captainId: 'p1-flagship',
        track: 'hull',
      },
      testCatalog,
    )
    const captain = state.captains.find((c) => c.id === 'p1-flagship')!
    expect(captain.shipUpgrades.hull).toBe(1)
    expect(state.players[0]!.resources.gold).toBe(goldBefore - 150)
  })

  it('rejects upgrades without a shipyard, on a maxed track, or without owning the captain', () => {
    const withoutShipyard = createGame({ ...shipyardConfig(), startingBuildings: ['townhall'] })
    const cityA = withoutShipyard.cities.find((c) => c.ownerId === 'p1')!
    expect(() =>
      applyAction(
        withoutShipyard,
        {
          type: 'upgradeShip',
          playerId: 'p1',
          cityId: cityA.id,
          captainId: 'p1-flagship',
          track: 'hull',
        },
        testCatalog,
      ),
    ).toThrow(InvalidActionError)

    let state = createGame(shipyardConfig())
    const city = state.cities.find((c) => c.ownerId === 'p1')!
    state = applyAction(
      state,
      {
        type: 'upgradeShip',
        playerId: 'p1',
        cityId: city.id,
        captainId: 'p1-flagship',
        track: 'hull',
      },
      testCatalog,
    )
    // Only one level defined for 'hull' in testCatalog — the second purchase is rejected as maxed.
    expect(() =>
      applyAction(
        state,
        {
          type: 'upgradeShip',
          playerId: 'p1',
          cityId: city.id,
          captainId: 'p1-flagship',
          track: 'hull',
        },
        testCatalog,
      ),
    ).toThrow(InvalidActionError)

    expect(() =>
      applyAction(
        state,
        {
          type: 'upgradeShip',
          playerId: 'p1',
          cityId: city.id,
          captainId: 'p2-flagship',
          track: 'crewCapacity',
        },
        testCatalog,
      ),
    ).toThrow(InvalidActionError)
  })

  it('replaying a log with upgradeShip is deterministic', () => {
    const base = createGame(shipyardConfig())
    const city = base.cities.find((c) => c.ownerId === 'p1')!
    const log: Action[] = [
      {
        type: 'upgradeShip',
        playerId: 'p1',
        cityId: city.id,
        captainId: 'p1-flagship',
        track: 'crewCapacity',
      },
      { type: 'endTurn', playerId: 'p1' },
    ]
    const a = replay(base, log, testCatalog)
    const b = replay(base, log, testCatalog)
    expect(JSON.stringify(a)).toBe(JSON.stringify(b))
    expect(a.captains.find((c) => c.id === 'p1-flagship')!.shipUpgrades.crewCapacity).toBe(1)
  })
})
