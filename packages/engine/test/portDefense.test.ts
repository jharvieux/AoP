import { describe, expect, it } from 'vitest'
import {
  applyAction,
  cityPortDefenders,
  cityToCombatant,
  combatantStrength,
  createCombatStats,
  playerView,
  replay,
  RULES_VERSION,
  seedRng,
  tileKey,
  type Action,
  type Captain,
  type CityState,
  type CombatStatsData,
  type ContentCatalog,
  type GameMap,
  type GameState,
  type LandingParty,
  type Tile,
  type TileType,
} from '../src'
import { BATTLE_TUNING, COMBAT_TUNING, GAME_SETUP, TACTICS_TUNING } from './fixtures'

/**
 * Garrisoned captains and port defense (#498): a docked captain can stand
 * garrison in an owned city — immobile, its ship and combat bonuses joined to
 * the city's defence — and every own ship in port automatically joins when an
 * assault resolves (sea or land). The price of a defended harbor: if the city
 * falls, the garrisoned captain AND every in-port captain are all captured by
 * the conqueror. All bit-exact from the action log.
 */

const UNITS = [
  { id: 'grunt', attack: 5, defense: 2, health: 12, speed: 5 },
  { id: 'brute', attack: 16, defense: 8, health: 44, speed: 5 },
  { id: 'b1', attack: 3, defense: 1, health: 7, speed: 5 },
  { id: 'turret:british:1', attack: 3, defense: 1, health: 7, speed: 3, range: 4, stationary: true }, // prettier-ignore
]

const STATS: CombatStatsData = {
  units: UNITS,
  ships: [{ id: 'sloop', hull: 40, cannons: 6, speed: 5 }],
  combat: COMBAT_TUNING,
  tactics: TACTICS_TUNING,
  battle: BATTLE_TUNING,
}

const CATALOG: ContentCatalog = {
  buildings: { townhall: { produces: { gold: 100 }, cost: {}, unlocksTier: 1 } },
  units: {
    grunt: { factionId: 'pirates', tier: 1, goldCost: 25, weeklyGrowth: 8, attack: 5, defense: 2, health: 12 }, // prettier-ignore
    brute: { factionId: 'pirates', tier: 3, goldCost: 150, weeklyGrowth: 2, attack: 16, defense: 8, health: 44 }, // prettier-ignore
    b1: { factionId: 'british', tier: 1, goldCost: 25, weeklyGrowth: 8, attack: 3, defense: 1, health: 7 }, // prettier-ignore
  },
  ships: { sloop: { hull: 40, cannons: 6, speed: 5, crewCapacity: 12, upgrades: {} } },
  skills: {
    'british-navigation-1': { factionId: 'british', tier: 1, attackBonusPct: 0, defenseBonusPct: 12 }, // prettier-ignore
  },
  captainXpThresholds: [0, 150, 400],
  captainStats: { attackPctPerPoint: 2, defensePctPerPoint: 2, speedMovementPerPoint: 1 },
}

/** Same island layout as landingParties.test.ts: land x 4–11 / y 4–7, port at (11,5). */
function islandMap(): GameMap {
  const width = 16
  const height = 12
  const tiles: Tile[] = Array.from({ length: width * height }, () => ({
    type: 'deep' as TileType,
    island: -1,
  }))
  for (let y = 4; y <= 7; y++) {
    for (let x = 4; x <= 11; x++) tiles[y * width + x] = { type: 'land', island: 0 }
  }
  tiles[5 * width + 11] = { type: 'port', island: 0 }
  return { width, height, tiles, startPositions: [] }
}

function makeCaptain(
  id: string,
  ownerId: string,
  position: { x: number; y: number },
  troops: { unitId: string; count: number }[] = [],
): Captain {
  return {
    id,
    ownerId,
    name: id,
    position,
    shipClassId: 'sloop',
    movementPoints: GAME_SETUP.startingCaptainMovement,
    maxMovementPoints: GAME_SETUP.startingCaptainMovement,
    troops,
    xp: 0,
    skills: [],
    stats: { attack: 0, defense: 0, speed: 0 },
    items: [],
    shipUpgrades: {},
    captured: false,
  }
}

function makeParty(
  id: string,
  ownerId: string,
  position: { x: number; y: number },
  troops: { unitId: string; count: number }[],
): LandingParty {
  return {
    id,
    ownerId,
    name: id,
    position,
    movementPoints: GAME_SETUP.partyMovementPoints,
    maxMovementPoints: GAME_SETUP.partyMovementPoints,
    troops,
  }
}

function portState(opts: {
  captains?: Captain[]
  parties?: LandingParty[]
  garrison?: Record<string, number>
  garrisonCaptainId?: string
  currentPlayerIndex?: number
}): GameState {
  const seats = [
    { id: 'p1', name: 'One', faction: 'pirates' as const, isAI: false },
    { id: 'p2', name: 'Two', faction: 'british' as const, isAI: false },
  ]
  const city: CityState = {
    id: 'p2-city',
    ownerId: 'p2',
    name: 'Port Royal',
    position: { x: 11, y: 5 },
    buildings: ['townhall'],
    builtThisRound: false,
    garrison: opts.garrison ?? {},
    unitAvailability: {},
    ...(opts.garrisonCaptainId !== undefined ? { garrisonCaptainId: opts.garrisonCaptainId } : {}),
  }
  return {
    config: {
      seed: 1,
      mapSize: 'small',
      setup: GAME_SETUP,
      combatStats: STATS,
      content: CATALOG,
      players: seats,
      rulesVersion: RULES_VERSION,
    },
    map: islandMap(),
    round: 1,
    currentPlayerIndex: opts.currentPlayerIndex ?? 0,
    players: seats.map((s) => ({
      id: s.id,
      name: s.name,
      faction: s.faction,
      isAI: s.isAI,
      resources: { gold: 0, timber: 0, iron: 0, rum: 0 },
      eliminated: false,
      reputation: 100,
      itemStash: [],
    })),
    alliances: { pairs: [], proposals: [] },
    cities: [city],
    captains: opts.captains ?? [],
    parties: opts.parties ?? [],
    encounters: [],
    landSites: [],
    landEncounters: [],
    resourceNodes: [],
    exploredTiles: {},
    rngState: seedRng(1),
    actionCount: 0,
    status: 'active',
    winnerId: null,
  }
}

// The water tile beside p2's port city — "docked" range for p2's ships.
const DOCK = { x: 12, y: 5 }

describe('garrisonCaptain / ungarrisonCaptain (#498)', () => {
  const base = () =>
    portState({
      captains: [makeCaptain('c2', 'p2', DOCK, [{ unitId: 'b1', count: 2 }])],
      currentPlayerIndex: 1,
    })

  it('stations a docked captain: garrisonCaptainId set, movement and sail order spent', () => {
    const withOrder: GameState = {
      ...base(),
      captains: base().captains.map((c) => ({
        ...c,
        sailOrder: { destination: { x: 1, y: 1 }, knownContactIds: [] },
      })),
    }
    const next = applyAction(withOrder, {
      type: 'garrisonCaptain',
      playerId: 'p2',
      captainId: 'c2',
      cityId: 'p2-city',
    })
    expect(next.cities[0]!.garrisonCaptainId).toBe('c2')
    const cap = next.captains[0]!
    expect(cap.movementPoints).toBe(0)
    expect(cap.sailOrder).toBeUndefined()
  })

  it('rejects garrisoning when not docked, at a foreign city, or doubly', () => {
    const far = portState({
      captains: [makeCaptain('c2', 'p2', { x: 2, y: 5 })],
      currentPlayerIndex: 1,
    })
    expect(
      () =>
      applyAction(far, { type: 'garrisonCaptain', playerId: 'p2', captainId: 'c2', cityId: 'p2-city' }), // prettier-ignore
    ).toThrow(/not docked/)

    const foreign = portState({
      captains: [makeCaptain('c1', 'p1', DOCK)],
    })
    expect(
      () =>
      applyAction(foreign, { type: 'garrisonCaptain', playerId: 'p1', captainId: 'c1', cityId: 'p2-city' }), // prettier-ignore
    ).toThrow(/owned by/)

    const taken = portState({
      captains: [makeCaptain('c2', 'p2', DOCK), makeCaptain('c3', 'p2', { x: 11, y: 4 })],
      garrisonCaptainId: 'c2',
      currentPlayerIndex: 1,
    })
    expect(
      () =>
      applyAction(taken, { type: 'garrisonCaptain', playerId: 'p2', captainId: 'c3', cityId: 'p2-city' }), // prettier-ignore
    ).toThrow(/already has a garrisoned captain/)
    // Nor can the garrisoned captain itself re-garrison anywhere.
    expect(
      () =>
      applyAction(taken, { type: 'garrisonCaptain', playerId: 'p2', captainId: 'c2', cityId: 'p2-city' }), // prettier-ignore
    ).toThrow(/garrisoned/)
  })

  it('a garrisoned captain is immobile: move, attack, disembark, sail orders all rejected', () => {
    const state = portState({
      captains: [
        { ...makeCaptain('c2', 'p2', DOCK, [{ unitId: 'b1', count: 2 }]), movementPoints: 5 },
        makeCaptain('c1', 'p1', { x: 12, y: 4 }, [{ unitId: 'grunt', count: 2 }]),
      ],
      garrisonCaptainId: 'c2',
      currentPlayerIndex: 1,
    })
    const acts: Action[] = [
      { type: 'moveCaptain', playerId: 'p2', captainId: 'c2', to: { x: 12, y: 6 } },
      { type: 'attackCaptain', playerId: 'p2', captainId: 'c2', targetCaptainId: 'c1' },
      { type: 'disembark', playerId: 'p2', captainId: 'c2', to: { x: 11, y: 6 }, troops: [{ unitId: 'b1', count: 1 }] }, // prettier-ignore
      { type: 'setSailOrder', playerId: 'p2', captainId: 'c2', destination: { x: 1, y: 1 } },
    ]
    for (const action of acts) {
      expect(() => applyAction(state, action)).toThrow(/garrisoned/)
    }
  })

  it('a garrisoned captain is not a naval target — assault the city instead', () => {
    const state = portState({
      captains: [
        makeCaptain('c2', 'p2', DOCK),
        makeCaptain('c1', 'p1', { x: 12, y: 4 }, [{ unitId: 'grunt', count: 4 }]),
      ],
      garrisonCaptainId: 'c2',
    })
    expect(() =>
      applyAction(state, {
        type: 'attackCaptain',
        playerId: 'p1',
        captainId: 'c1',
        targetCaptainId: 'c2',
      }),
    ).toThrow(/assault the city/)
  })

  it('stays at zero movement across turn refreshes while garrisoned; ungarrison restores the next refresh', () => {
    let state = applyAction(base(), {
      type: 'garrisonCaptain',
      playerId: 'p2',
      captainId: 'c2',
      cityId: 'p2-city',
    })
    state = applyAction(state, { type: 'endTurn', playerId: 'p2' })
    state = applyAction(state, { type: 'endTurn', playerId: 'p1' })
    expect(state.captains[0]!.movementPoints).toBe(0)

    state = applyAction(state, { type: 'ungarrisonCaptain', playerId: 'p2', cityId: 'p2-city' })
    expect(state.cities[0]!.garrisonCaptainId).toBeUndefined()
    // Standing down spent the berth turn; the ship sails again from next refresh.
    expect(state.captains[0]!.movementPoints).toBe(0)
    state = applyAction(state, { type: 'endTurn', playerId: 'p2' })
    state = applyAction(state, { type: 'endTurn', playerId: 'p1' })
    expect(state.captains[0]!.movementPoints).toBe(GAME_SETUP.startingCaptainMovement)
  })

  it('rejects ungarrisoning a city with no garrisoned captain', () => {
    expect(() =>
      applyAction(base(), { type: 'ungarrisonCaptain', playerId: 'p2', cityId: 'p2-city' }),
    ).toThrow(/no garrisoned captain/)
  })
})

describe('cityToCombatant with port defenders (#498)', () => {
  it('folds each defending ship’s hull/cannons and its captain’s bonuses into the defence', () => {
    const skilled: Captain = {
      ...makeCaptain('c2', 'p2', DOCK),
      skills: ['british-navigation-1'],
      stats: { attack: 1, defense: 2, speed: 0 },
    }
    const state = portState({ captains: [skilled], garrisonCaptainId: 'c2' })
    const city = state.cities[0]!
    const bare = cityToCombatant(city, CATALOG, 'british')
    const defended = cityToCombatant(city, CATALOG, 'british', cityPortDefenders(state, city))
    expect(defended.shipStats!.hull).toBe(bare.shipStats!.hull + 40)
    expect(defended.shipStats!.cannons).toBe(bare.shipStats!.cannons + 6)
    // Skill 12% def + 2 def points × 2%/pt = 16; attack 1 point × 2%/pt = 2.
    expect(defended.defenseBonusPct).toBe((bare.defenseBonusPct ?? 0) + 16)
    expect(defended.attackBonusPct).toBe(2)

    const stats = createCombatStats(STATS)
    expect(combatantStrength(defended, stats)).toBeGreaterThan(combatantStrength(bare, stats))
  })

  it('counts the garrisoned captain and every own in-port ship; never the attacker’s or far ships', () => {
    const state = portState({
      captains: [
        makeCaptain('c2', 'p2', DOCK), // garrisoned
        makeCaptain('c3', 'p2', { x: 12, y: 6 }), // in port (distance 1)
        makeCaptain('c4', 'p2', { x: 2, y: 2 }), // far away
        makeCaptain('c1', 'p1', { x: 12, y: 4 }), // the enemy, in range
      ],
      garrisonCaptainId: 'c2',
    })
    const ids = cityPortDefenders(state, state.cities[0]!).map((c) => c.id)
    expect(ids).toEqual(['c2', 'c3'])
  })
})

/** A sea assault on p2's city by p1's brute-loaded captain — decisive either way. */
function assault(state: GameState): GameState {
  return applyAction(state, {
    type: 'attackCity',
    playerId: 'p1',
    captainId: 'c1',
    targetCityId: 'p2-city',
  })
}

describe('city falls with its harbor (#498)', () => {
  // Both seats keep a spare captain far from the harbor, so losing the battle
  // (and the city) never eliminates a seat and sweeps the captives off the
  // board (#208) before the assertions can see them.
  const defendedState = () =>
    portState({
      captains: [
        makeCaptain('c1', 'p1', { x: 12, y: 4 }, [{ unitId: 'brute', count: 30 }]),
        makeCaptain('spare1', 'p1', { x: 1, y: 1 }),
        makeCaptain('c2', 'p2', DOCK),
        makeCaptain('c3', 'p2', { x: 12, y: 6 }),
        makeCaptain('spare2', 'p2', { x: 1, y: 10 }),
      ],
      garrisonCaptainId: 'c2',
      garrison: { b1: 1 },
    })

  it('sea assault: a fallen city’s garrisoned AND in-port captains are all captured', () => {
    const next = assault(defendedState())
    const city = next.cities[0]!
    expect(city.ownerId).toBe('p1')
    expect(city.garrisonCaptainId).toBeUndefined()
    for (const id of ['c2', 'c3']) {
      const cap = next.captains.find((c) => c.id === id)!
      expect(cap.captured).toBe(true)
      expect(cap.capturedBy).toBe('p1')
      expect(cap.captivityReturnRound).toBe(1 + GAME_SETUP.captainCaptivityRounds)
    }
    expect(next.captains.find((c) => c.id === 'c1')!.captured).toBe(false)
  })

  it('land assault: a party taking the city captures the harbor the same way', () => {
    const base = defendedState()
    const state: GameState = {
      ...base,
      captains: base.captains.filter((c) => c.id !== 'c1'),
      parties: [makeParty('lp1', 'p1', { x: 10, y: 5 }, [{ unitId: 'brute', count: 30 }])],
    }
    const next = applyAction(state, {
      type: 'partyAssaultCity',
      playerId: 'p1',
      partyId: 'lp1',
      targetCityId: 'p2-city',
    })
    expect(next.cities[0]!.ownerId).toBe('p1')
    for (const id of ['c2', 'c3']) {
      expect(next.captains.find((c) => c.id === id)!.captured).toBe(true)
    }
  })

  it('clears a neighbour city’s garrison marker when its captain is captured in port range', () => {
    // c4 garrisons Deepwater at (11,7) but is anchored at (12,6) — inside the
    // assaulted city's port range too. When Port Royal falls, c4 is captured
    // with the harbor, and Deepwater's garrison marker must not dangle.
    const base = defendedState()
    const state: GameState = {
      ...base,
      captains: [...base.captains, makeCaptain('c4', 'p2', { x: 12, y: 6 })],
      cities: [
        ...base.cities,
        {
          id: 'p2-city-2',
          ownerId: 'p2',
          name: 'Deepwater',
          position: { x: 11, y: 7 },
          buildings: ['townhall'],
          builtThisRound: false,
          garrison: {},
          unitAvailability: {},
          garrisonCaptainId: 'c4',
        },
      ],
    }
    const next = assault(state)
    expect(next.cities.find((c) => c.id === 'p2-city')!.ownerId).toBe('p1')
    expect(next.captains.find((c) => c.id === 'c4')!.captured).toBe(true)
    const neighbour = next.cities.find((c) => c.id === 'p2-city-2')!
    expect(neighbour.ownerId).toBe('p2')
    expect(neighbour.garrisonCaptainId).toBeUndefined()
  })

  it('a successful defense keeps the garrisoned captain in place and everyone free', () => {
    const state = portState({
      captains: [
        makeCaptain('c1', 'p1', { x: 12, y: 4 }, [{ unitId: 'grunt', count: 1 }]),
        makeCaptain('spare1', 'p1', { x: 1, y: 1 }),
        makeCaptain('c2', 'p2', DOCK),
      ],
      garrisonCaptainId: 'c2',
      garrison: { b1: 30 },
    })
    const next = assault(state)
    expect(next.cities[0]!.ownerId).toBe('p2')
    expect(next.cities[0]!.garrisonCaptainId).toBe('c2')
    expect(next.captains.find((c) => c.id === 'c2')!.captured).toBe(false)
    // The failed sea attacker is captured, exactly as before #498.
    expect(next.captains.find((c) => c.id === 'c1')!.captured).toBe(true)
  })

  it('replays a garrison-then-assault log to an identical state', () => {
    const base = portState({
      captains: [
        makeCaptain('c1', 'p1', { x: 12, y: 4 }, [{ unitId: 'brute', count: 30 }]),
        makeCaptain('c2', 'p2', DOCK),
        makeCaptain('spare2', 'p2', { x: 1, y: 10 }),
      ],
      garrison: { b1: 2 },
      currentPlayerIndex: 1,
    })
    const log: Action[] = [
      { type: 'garrisonCaptain', playerId: 'p2', captainId: 'c2', cityId: 'p2-city' },
      { type: 'endTurn', playerId: 'p2' },
      { type: 'attackCity', playerId: 'p1', captainId: 'c1', targetCityId: 'p2-city' },
    ]
    const a = replay(base, log)
    const b = replay(base, log)
    expect(JSON.stringify(a)).toBe(JSON.stringify(b))
    expect(a.captains.find((c) => c.id === 'c2')!.captured).toBe(true)
  })
})

describe('garrison fog of war (#498)', () => {
  it('shows garrisonCaptainId to the owner and hides it from an enemy who explored the city', () => {
    const state = portState({
      captains: [makeCaptain('c2', 'p2', DOCK), makeCaptain('c1', 'p1', { x: 12, y: 4 })],
      garrisonCaptainId: 'c2',
    })
    const explored: GameState = {
      ...state,
      exploredTiles: { p1: [tileKey({ x: 11, y: 5 })], p2: [] },
    }
    const ownCity = playerView(explored, 'p2').cities.find((c) => c.id === 'p2-city')!
    expect(ownCity.garrisonCaptainId).toBe('c2')
    const enemyCity = playerView(explored, 'p1').cities.find((c) => c.id === 'p2-city')!
    expect(enemyCity.garrisonCaptainId).toBeUndefined()
    expect(enemyCity.garrison).toBeUndefined()
  })
})
