import { describe, expect, it } from 'vitest'
import {
  applyAction,
  applyActionWithOutcome,
  currentContacts,
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
 * Landing parties (#465) — the replay contract for the five party actions:
 * `disembark` (troops step ashore), `moveParty` (overland marching), `embark`
 * (re-boarding, partial allowed), `attackParty` (land battles between
 * parties), and `partyAssaultCity` (land-side city assault against the FULL
 * militia-and-turret defense, per the epic #469 operator decisions). Plus the
 * piece-lifecycle rules: parties persist stranded until rescued, keep their
 * seat alive, are swept on elimination/resign (#450), extend fog-of-war
 * vision, and are filtered in player views like ships. All bit-exact.
 */

// Pirates are the attacker roster (p1), british the defender roster (p2).
const UNITS = [
  { id: 'grunt', attack: 5, defense: 2, health: 12, speed: 5 },
  { id: 'brute', attack: 16, defense: 8, health: 44, speed: 5 },
  { id: 'b1', attack: 3, defense: 1, health: 7, speed: 5 },
  // Turret stat rows for both rosters, as @aop/content bakes them (#435).
  { id: 'turret:british:1', attack: 3, defense: 1, health: 7, speed: 3, range: 4, stationary: true }, // prettier-ignore
  { id: 'turret:pirates:1', attack: 3, defense: 0, health: 7, speed: 3, range: 4, stationary: true }, // prettier-ignore
]

const STATS: CombatStatsData = {
  units: UNITS,
  ships: [{ id: 'sloop', hull: 40, cannons: 6, speed: 5 }],
  combat: COMBAT_TUNING,
  tactics: TACTICS_TUNING,
  battle: BATTLE_TUNING,
}

/** Catalog WITH city-defense tuning, so every assaulted city fields militia + turrets (#435). */
const CATALOG: ContentCatalog = {
  buildings: {
    townhall: { produces: { gold: 100 }, cost: {}, unlocksTier: 1 },
  },
  units: {
    grunt: { factionId: 'pirates', tier: 1, goldCost: 25, weeklyGrowth: 8, attack: 5, defense: 2, health: 12 }, // prettier-ignore
    brute: { factionId: 'pirates', tier: 3, goldCost: 150, weeklyGrowth: 2, attack: 16, defense: 8, health: 44 }, // prettier-ignore
    b1: { factionId: 'british', tier: 1, goldCost: 25, weeklyGrowth: 8, attack: 3, defense: 1, health: 7 }, // prettier-ignore
  },
  ships: {
    sloop: { hull: 40, cannons: 6, speed: 5, crewCapacity: 12, upgrades: {} },
  },
  skills: {},
  captainXpThresholds: [0, 150, 400, 800, 1400],
  cityDefense: { militiaPerType: 3, turretCount: 2, neutralRosterFactionId: 'pirates' },
}

/**
 * A handcrafted square map: one 8×4 island (land x 4–11, y 4–7, with the
 * (11,5) tile a port for p2's city), an isolated one-tile islet at (2,2) for
 * the unreachable-overland case, open deep water everywhere else.
 */
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
  tiles[2 * width + 2] = { type: 'land', island: 1 }
  return { width, height, tiles, startPositions: [] }
}

function makeCaptain(
  id: string,
  ownerId: string,
  position: { x: number; y: number },
  troops: { unitId: string; count: number }[],
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
    shipUpgrades: {},
    captured: false,
  }
}

function makeParty(
  id: string,
  ownerId: string,
  position: { x: number; y: number },
  troops: { unitId: string; count: number }[],
  movementPoints = GAME_SETUP.partyMovementPoints,
): LandingParty {
  return {
    id,
    ownerId,
    name: id,
    position,
    movementPoints,
    maxMovementPoints: GAME_SETUP.partyMovementPoints,
    troops,
  }
}

/**
 * A handcrafted two-seat state on the island map: p1 (pirates, acting unless
 * `currentPlayerIndex` says otherwise), p2 (british) owning the port city at
 * (11,5) unless `p2City: false`. Precise piece placement the procedural
 * generator can't give us — the same pattern as engine.test.ts's sailState.
 */
function islandState(opts: {
  captains?: Captain[]
  parties?: LandingParty[]
  p2City?: boolean
  garrison?: Record<string, number>
  currentPlayerIndex?: number
  allied?: boolean
}): GameState {
  const seats = [
    { id: 'p1', name: 'One', faction: 'pirates' as const, isAI: false },
    { id: 'p2', name: 'Two', faction: 'british' as const, isAI: false },
  ]
  const cities: CityState[] =
    opts.p2City === false
      ? []
      : [
          {
            id: 'p2-city',
            ownerId: 'p2',
            name: 'Port Royal',
            position: { x: 11, y: 5 },
            buildings: ['townhall'],
            builtThisRound: false,
            garrison: opts.garrison ?? {},
            unitAvailability: {},
          },
        ]
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
    })),
    alliances: { pairs: opts.allied ? [{ a: 'p1', b: 'p2' }] : [], proposals: [] },
    cities,
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

describe('disembark (#465)', () => {
  const base = () =>
    islandState({
      captains: [makeCaptain('c1', 'p1', { x: 3, y: 4 }, [{ unitId: 'grunt', count: 6 }])],
    })

  it('puts the chosen troops ashore as a new zero-movement party, costing the ship one point', () => {
    const state = applyAction(base(), {
      type: 'disembark',
      playerId: 'p1',
      captainId: 'c1',
      to: { x: 4, y: 4 },
      troops: [{ unitId: 'grunt', count: 4 }],
    })
    expect(state.parties).toEqual([
      {
        id: 'party-0',
        ownerId: 'p1',
        name: "One's Landing Party",
        position: { x: 4, y: 4 },
        movementPoints: 0,
        maxMovementPoints: GAME_SETUP.partyMovementPoints,
        troops: [{ unitId: 'grunt', count: 4 }],
      },
    ])
    const captain = state.captains[0]!
    expect(captain.troops).toEqual([{ unitId: 'grunt', count: 2 }])
    expect(captain.movementPoints).toBe(GAME_SETUP.startingCaptainMovement - 1)
  })

  it('rejects water tiles, port (city) tiles, non-adjacent land, and occupied tiles', () => {
    const land = (to: { x: number; y: number }): Action => ({
      type: 'disembark',
      playerId: 'p1',
      captainId: 'c1',
      to,
      troops: [{ unitId: 'grunt', count: 1 }],
    })
    expect(() => applyAction(base(), land({ x: 3, y: 3 }))).toThrow(/open land/)
    expect(() => applyAction(base(), land({ x: 6, y: 4 }))).toThrow(/not adjacent/)
    const portSide = islandState({
      captains: [makeCaptain('c1', 'p1', { x: 12, y: 5 }, [{ unitId: 'grunt', count: 6 }])],
    })
    expect(() => applyAction(portSide, land({ x: 11, y: 5 }))).toThrow(/open land/)
    const occupied = {
      ...base(),
      parties: [makeParty('blocker', 'p2', { x: 4, y: 4 }, [{ unitId: 'b1', count: 1 }])],
    }
    expect(() => applyAction(occupied, land({ x: 4, y: 4 }))).toThrow(/already holds/)
  })

  it('rejects empty or overdrawn troop manifests and a ship with no movement', () => {
    const action = (troops: { unitId: string; count: number }[]): Action => ({
      type: 'disembark',
      playerId: 'p1',
      captainId: 'c1',
      to: { x: 4, y: 4 },
      troops,
    })
    expect(() => applyAction(base(), action([]))).toThrow(/needs troops/)
    expect(() => applyAction(base(), action([{ unitId: 'grunt', count: 7 }]))).toThrow(/aboard/)
    expect(() =>
      applyAction(
        base(),
        action([
          { unitId: 'grunt', count: 2 },
          { unitId: 'grunt', count: 2 },
        ]),
      ),
    ).toThrow(/Duplicate/)
    const spent = {
      ...base(),
      captains: [{ ...base().captains[0]!, movementPoints: 0 }],
    }
    expect(() => applyAction(spent, action([{ unitId: 'grunt', count: 1 }]))).toThrow(/no movement/)
  })
})

describe('moveParty (#465)', () => {
  const withParty = (mp?: number) =>
    islandState({
      parties: [makeParty('lp1', 'p1', { x: 4, y: 4 }, [{ unitId: 'grunt', count: 4 }], mp)],
    })

  it('marches across land, spends one point per step, and reveals the route', () => {
    const state = applyAction(withParty(), {
      type: 'moveParty',
      playerId: 'p1',
      partyId: 'lp1',
      to: { x: 7, y: 4 },
    })
    const party = state.parties[0]!
    expect(party.position).toEqual({ x: 7, y: 4 })
    expect(party.movementPoints).toBe(0)
    // Marched tiles (and their vision radius) are remembered, like a ship's wake.
    expect(state.exploredTiles.p1).toContain(tileKey({ x: 5, y: 4 }))
    expect(state.exploredTiles.p1).toContain(tileKey({ x: 7, y: 6 }))
  })

  it('rejects marches beyond its movement, into water, or across water to another island', () => {
    const to = (x: number, y: number): Action => ({
      type: 'moveParty',
      playerId: 'p1',
      partyId: 'lp1',
      to: { x, y },
    })
    expect(() => applyAction(withParty(), to(8, 4))).toThrow(/costs 4/)
    expect(() => applyAction(withParty(), to(3, 4))).toThrow(/not reachable overland/)
    expect(() => applyAction(withParty(), to(2, 2))).toThrow(/not reachable overland/)
  })

  it('never enters or crosses a tile another party holds — friend or foe', () => {
    const walled = {
      ...withParty(),
      parties: [
        ...withParty().parties,
        makeParty('wall1', 'p2', { x: 5, y: 4 }, [{ unitId: 'b1', count: 1 }]),
        makeParty('wall2', 'p2', { x: 5, y: 5 }, [{ unitId: 'b1', count: 1 }]),
        makeParty('wall3', 'p1', { x: 5, y: 6 }, [{ unitId: 'grunt', count: 1 }]),
        makeParty('wall4', 'p1', { x: 5, y: 7 }, [{ unitId: 'grunt', count: 1 }]),
      ],
    }
    const move: Action = { type: 'moveParty', playerId: 'p1', partyId: 'lp1', to: { x: 6, y: 4 } }
    expect(() => applyAction(walled, move)).toThrow(/not reachable overland/)
    // The occupied tile itself is never a destination either.
    const onto: Action = { type: 'moveParty', playerId: 'p1', partyId: 'lp1', to: { x: 5, y: 4 } }
    expect(() => applyAction(walled, onto)).toThrow(/not reachable overland/)
  })
})

describe('embark (#465)', () => {
  const shore = (shipTroops: number, partyTroops: number) =>
    islandState({
      captains: [makeCaptain('c1', 'p1', { x: 3, y: 4 }, shipTroops > 0 ? [{ unitId: 'grunt', count: shipTroops }] : [])], // prettier-ignore
      parties: [makeParty('lp1', 'p1', { x: 4, y: 4 }, [{ unitId: 'grunt', count: partyTroops }])],
    })
  const action: Action = { type: 'embark', playerId: 'p1', partyId: 'lp1', captainId: 'c1' }

  it('re-boards the whole party when it fits, removing the piece from the map', () => {
    const state = applyAction(shore(2, 4), action)
    expect(state.parties).toEqual([])
    expect(state.captains[0]!.troops).toEqual([{ unitId: 'grunt', count: 6 }])
  })

  it('re-boards partially when capacity binds, leaving the remainder ashore as the same party', () => {
    const state = applyAction(shore(10, 5), action)
    expect(state.captains[0]!.troops).toEqual([{ unitId: 'grunt', count: 12 }])
    expect(state.parties).toEqual([
      { ...makeParty('lp1', 'p1', { x: 4, y: 4 }, [{ unitId: 'grunt', count: 3 }]) },
    ])
  })

  it('rejects a full ship and a ship that is not adjacent to the party', () => {
    expect(() => applyAction(shore(12, 4), action)).toThrow(/no room/)
    const far = {
      ...shore(2, 4),
      captains: [{ ...shore(2, 4).captains[0]!, position: { x: 1, y: 1 } }],
    }
    expect(() => applyAction(far, action)).toThrow(/not adjacent/)
  })
})

describe('attackParty (#465)', () => {
  const battlefield = (attackerTroops: { unitId: string; count: number }[], allied = false) =>
    islandState({
      // A home captain keeps p1 alive if its party falls.
      captains: [makeCaptain('c1', 'p1', { x: 3, y: 4 }, [])],
      parties: [
        makeParty('lp1', 'p1', { x: 5, y: 5 }, attackerTroops),
        makeParty('lp2', 'p2', { x: 6, y: 5 }, [{ unitId: 'b1', count: 2 }]),
      ],
      allied,
    })
  const attack: Action = {
    type: 'attackParty',
    playerId: 'p1',
    partyId: 'lp1',
    targetPartyId: 'lp2',
  }

  it('destroys the beaten party outright and spends the winner', () => {
    const { state, battleReport } = applyActionWithOutcome(
      battlefield([{ unitId: 'brute', count: 10 }]),
      attack,
    )
    expect(battleReport?.winnerId).toBe('p1')
    expect(state.parties.map((p) => p.id)).toEqual(['lp1'])
    const winner = state.parties[0]!
    expect(winner.movementPoints).toBe(0)
    expect(winner.troops.reduce((sum, t) => sum + t.count, 0)).toBeGreaterThan(0)
  })

  it('a losing attacker is destroyed and the defender keeps its survivors', () => {
    const outnumbered = islandState({
      captains: [makeCaptain('c1', 'p1', { x: 3, y: 4 }, [])],
      parties: [
        makeParty('lp1', 'p1', { x: 5, y: 5 }, [{ unitId: 'grunt', count: 1 }]),
        makeParty('lp2', 'p2', { x: 6, y: 5 }, [{ unitId: 'brute', count: 10 }]),
      ],
    })
    const state = applyAction(outnumbered, attack)
    expect(state.parties.map((p) => p.id)).toEqual(['lp2'])
    expect(state.players.find((p) => p.id === 'p1')!.eliminated).toBe(false)
  })

  it('rejects self-targets, out-of-range targets, and a spent attacker', () => {
    const twoOwn = islandState({
      parties: [
        makeParty('lp1', 'p1', { x: 5, y: 5 }, [{ unitId: 'grunt', count: 1 }]),
        makeParty('lp3', 'p1', { x: 6, y: 5 }, [{ unitId: 'grunt', count: 1 }]),
      ],
    })
    expect(() =>
      applyAction(twoOwn, {
        type: 'attackParty',
        playerId: 'p1',
        partyId: 'lp1',
        targetPartyId: 'lp3',
      }),
    ).toThrow(/your own/)
    const far = islandState({
      parties: [
        makeParty('lp1', 'p1', { x: 4, y: 4 }, [{ unitId: 'grunt', count: 1 }]),
        makeParty('lp2', 'p2', { x: 7, y: 7 }, [{ unitId: 'b1', count: 1 }]),
      ],
    })
    expect(() => applyAction(far, attack)).toThrow(/attack range/)
    const spentState = battlefield([{ unitId: 'brute', count: 10 }])
    const spent = {
      ...spentState,
      parties: spentState.parties.map((p) => (p.id === 'lp1' ? { ...p, movementPoints: 0 } : p)),
    }
    expect(() => applyAction(spent, attack)).toThrow(/no movement/)
  })

  it('attacking an ally’s party is a betrayal: reputation paid, alliance dissolved (#138)', () => {
    const state = applyAction(battlefield([{ unitId: 'brute', count: 10 }], true), attack)
    expect(state.players.find((p) => p.id === 'p1')!.reputation).toBe(
      100 - GAME_SETUP.betrayalReputationPenalty,
    )
    expect(state.alliances.pairs).toEqual([])
  })
})

describe('partyAssaultCity (#465)', () => {
  const siege = (troops: { unitId: string; count: number }[], opts: { garrison?: Record<string, number>; p2Captain?: boolean } = {}) =>
    islandState({
      captains: opts.p2Captain ? [makeCaptain('c2', 'p2', { x: 12, y: 6 }, [])] : [],
      parties: [makeParty('lp1', 'p1', { x: 10, y: 5 }, troops)],
      garrison: opts.garrison ?? {},
    }) // prettier-ignore
  const assault: Action = {
    type: 'partyAssaultCity',
    playerId: 'p1',
    partyId: 'lp1',
    targetCityId: 'p2-city',
  }

  it('faces the FULL defense: an empty-garrison city still repels a token party (#435)', () => {
    // 1 grunt vs 3 free militia + 2 turrets: the land approach gets no discount.
    const state = applyAction(siege([{ unitId: 'grunt', count: 1 }], { p2Captain: true }), assault)
    expect(state.cities[0]!.ownerId).toBe('p2')
    expect(state.parties).toEqual([]) // the beaten party is destroyed, not captured
  })

  it('a decisive win flips the city exactly like a sea assault', () => {
    const { state, battleReport } = applyActionWithOutcome(
      siege([{ unitId: 'brute', count: 30 }], { garrison: { b1: 4 }, p2Captain: true }),
      assault,
    )
    expect(battleReport?.winnerId).toBe('p1')
    const city = state.cities[0]!
    expect(city.ownerId).toBe('p1')
    expect(city.garrison).toEqual({})
    expect(city.builtThisRound).toBe(true)
    expect(city.unitAvailability).toEqual({})
    const party = state.parties[0]!
    expect(party.movementPoints).toBe(0)
    expect(party.troops.reduce((sum, t) => sum + t.count, 0)).toBeGreaterThan(0)
  })

  it('a successful defense keeps only recruited troops — militia and turrets never persist', () => {
    const state = applyAction(
      siege([{ unitId: 'grunt', count: 1 }], { garrison: { b1: 5 }, p2Captain: true }),
      assault,
    )
    const garrison = state.cities[0]!.garrison
    expect(Object.keys(garrison).every((unitId) => unitId === 'b1')).toBe(true)
    expect(garrison.b1 ?? 0).toBeLessThanOrEqual(5)
  })

  it('taking the last city of a captainless seat wins the match — conquest overland', () => {
    const state = applyAction(siege([{ unitId: 'brute', count: 30 }]), assault)
    expect(state.players.find((p) => p.id === 'p2')!.eliminated).toBe(true)
    expect(state.status).toBe('finished')
    expect(state.winnerId).toBe('p1')
  })

  it('losing its last party eliminates a seat with nothing else left', () => {
    const lastStand = {
      ...siege([{ unitId: 'grunt', count: 1 }], { p2Captain: true }),
      captains: [makeCaptain('c2', 'p2', { x: 12, y: 6 }, [])],
    }
    const state = applyAction(lastStand, assault)
    expect(state.parties).toEqual([])
    expect(state.players.find((p) => p.id === 'p1')!.eliminated).toBe(true)
    expect(state.status).toBe('finished')
    expect(state.winnerId).toBe('p2')
  })
})

describe('party lifecycle (#465)', () => {
  it('persists stranded across rounds — no attrition — and refreshes movement each turn', () => {
    // p1's party is ashore with its fleet gone: nothing removes it, ever.
    const state = islandState({
      captains: [makeCaptain('c2', 'p2', { x: 13, y: 2 }, [])],
      parties: [makeParty('lp1', 'p1', { x: 6, y: 6 }, [{ unitId: 'grunt', count: 3 }], 0)],
    })
    let next = applyAction(state, { type: 'endTurn', playerId: 'p1' })
    next = applyAction(next, { type: 'endTurn', playerId: 'p2' })
    expect(next.round).toBe(2)
    const party = next.parties[0]!
    expect(party.troops).toEqual([{ unitId: 'grunt', count: 3 }])
    expect(party.movementPoints).toBe(GAME_SETUP.partyMovementPoints)
  })

  it('a landing party alone keeps its seat alive (stranded-until-rescued, epic #469)', () => {
    // p1 sea-assaults p2's last city and takes it; p2 still owns a party ashore.
    const state = islandState({
      captains: [makeCaptain('c1', 'p1', { x: 12, y: 5 }, [{ unitId: 'brute', count: 30 }])],
      parties: [makeParty('lp2', 'p2', { x: 5, y: 5 }, [{ unitId: 'b1', count: 2 }])],
    })
    const next = applyAction(state, {
      type: 'attackCity',
      playerId: 'p1',
      captainId: 'c1',
      targetCityId: 'p2-city',
    })
    expect(next.cities[0]!.ownerId).toBe('p1')
    expect(next.players.find((p) => p.id === 'p2')!.eliminated).toBe(false)
    expect(next.status).toBe('active')
    expect(next.parties.map((p) => p.id)).toEqual(['lp2'])
  })

  it('resign sweeps the seat’s parties off the board (#450/#208)', () => {
    const state = islandState({
      captains: [makeCaptain('c1', 'p1', { x: 3, y: 4 }, [])],
      parties: [
        makeParty('lp1', 'p1', { x: 4, y: 4 }, [{ unitId: 'grunt', count: 2 }]),
        makeParty('lp2', 'p2', { x: 6, y: 6 }, [{ unitId: 'b1', count: 2 }]),
      ],
      currentPlayerIndex: 1,
    })
    const next = applyAction(state, { type: 'resign', playerId: 'p2' })
    expect(next.parties.map((p) => p.id)).toEqual(['lp1'])
    expect(next.players.find((p) => p.id === 'p2')!.eliminated).toBe(true)
  })
})

describe('fog of war & player views (#465)', () => {
  const scene = () =>
    islandState({
      captains: [makeCaptain('c1', 'p1', { x: 3, y: 4 }, [])],
      parties: [
        // In p2's city vision (radius 3 of (11,5)).
        makeParty('lp1', 'p1', { x: 10, y: 5 }, [{ unitId: 'grunt', count: 4 }]),
        // Out of every p2 sightline (city and lp2 vision alike).
        makeParty('lp3', 'p1', { x: 4, y: 7 }, [{ unitId: 'grunt', count: 1 }]),
        makeParty('lp2', 'p2', { x: 10, y: 6 }, [{ unitId: 'b1', count: 2 }]),
      ],
    })

  it('discloses own parties fully and enemy parties as sightings only', () => {
    const view = playerView(scene(), 'p2')
    const ids = view.parties.map((p) => p.id).sort()
    expect(ids).toEqual(['lp1', 'lp2'])
    const own = view.parties.find((p) => p.id === 'lp2')!
    expect(own.troops).toEqual([{ unitId: 'b1', count: 2 }])
    expect(own.movementPoints).toBe(GAME_SETUP.partyMovementPoints)
    const sighting = view.parties.find((p) => p.id === 'lp1')!
    expect(sighting.position).toEqual({ x: 10, y: 5 })
    expect(sighting.troops).toBeUndefined()
    expect(sighting.movementPoints).toBeUndefined()
  })

  it('a party extends its owner’s vision and counts as an enemy contact (#372)', () => {
    const view = playerView(scene(), 'p1')
    // lp1 at (10,5) sees p2's lp2 at (10,6): distance 1 ≤ captainVisionRadius.
    expect(view.parties.some((p) => p.id === 'lp2')).toBe(true)
    expect(currentContacts(scene(), 'p1')).toContain('lp2')
  })
})

describe('replay determinism (#465)', () => {
  const base = () =>
    islandState({
      captains: [
        makeCaptain('c1', 'p1', { x: 3, y: 4 }, [{ unitId: 'brute', count: 8 }]),
        makeCaptain('c2', 'p2', { x: 13, y: 2 }, []),
      ],
      parties: [makeParty('lp2', 'p2', { x: 5, y: 4 }, [{ unitId: 'b1', count: 2 }])],
      garrison: { b1: 2 },
    })

  const nextRound: readonly Action[] = [
    { type: 'endTurn', playerId: 'p1' },
    { type: 'endTurn', playerId: 'p2' },
  ]
  const LOG: readonly Action[] = [
    { type: 'disembark', playerId: 'p1', captainId: 'c1', to: { x: 4, y: 4 }, troops: [{ unitId: 'brute', count: 6 }] }, // prettier-ignore
    ...nextRound,
    { type: 'attackParty', playerId: 'p1', partyId: 'party-0', targetPartyId: 'lp2' },
    ...nextRound,
    { type: 'moveParty', playerId: 'p1', partyId: 'party-0', to: { x: 7, y: 4 } },
    ...nextRound,
    { type: 'moveParty', playerId: 'p1', partyId: 'party-0', to: { x: 10, y: 5 } },
    ...nextRound,
    { type: 'partyAssaultCity', playerId: 'p1', partyId: 'party-0', targetCityId: 'p2-city' },
    ...nextRound,
    { type: 'moveParty', playerId: 'p1', partyId: 'party-0', to: { x: 7, y: 4 } },
    ...nextRound,
    { type: 'moveParty', playerId: 'p1', partyId: 'party-0', to: { x: 4, y: 4 } },
    { type: 'embark', playerId: 'p1', partyId: 'party-0', captainId: 'c1' },
  ]

  it('replays the full landing-party campaign byte-identically', () => {
    const a = replay(base(), LOG)
    const b = replay(base(), LOG)
    expect(JSON.stringify(a)).toBe(JSON.stringify(b))
    // The campaign actually happened: an enemy party fell, the city fell
    // overland, and the survivors re-boarded in full (well under capacity 12),
    // removing the party piece from the map.
    expect(a.cities[0]!.ownerId).toBe('p1')
    expect(a.parties).toEqual([])
    const flagship = a.captains.find((c) => c.id === 'c1')!
    expect(flagship.troops.reduce((sum, t) => sum + t.count, 0)).toBeGreaterThan(2)
  })

  it('resumes bit-exact from a JSON round-trip at every prefix', () => {
    const full = JSON.stringify(replay(base(), LOG))
    const roundTrip = (s: GameState): GameState => JSON.parse(JSON.stringify(s)) as GameState
    for (let k = 1; k < LOG.length; k++) {
      const stateAtK = replay(base(), LOG.slice(0, k))
      const resumed = replay(roundTrip(stateAtK), LOG.slice(k))
      expect(JSON.stringify(resumed)).toBe(full)
    }
  })
})
