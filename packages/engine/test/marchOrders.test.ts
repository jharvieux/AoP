import { describe, expect, it } from 'vitest'
import {
  applyAction,
  playerView,
  replay,
  RULES_VERSION,
  seedRng,
  type Action,
  type CityState,
  type CombatStatsData,
  type GameMap,
  type GameState,
  type LandingParty,
  type MarchOrder,
  type Tile,
  type TileType,
} from '../src'
import { BATTLE_TUNING, COMBAT_TUNING, GAME_SETUP, TACTICS_TUNING } from './fixtures'

/**
 * Standing march orders (#482) — the replay contract for `setMarchOrder` /
 * `clearMarchOrder` and the turn-start auto-march, mirroring the sail-order
 * suite's semantics (#372): immediate first leg, per-turn continuation,
 * clear-on-arrival, manual-march override, pause on a NEW fog-of-war contact,
 * and — unlike sail orders — pause when the route is currently impassable
 * (another party blocks every path or squats the destination). Plus the
 * lifecycle edges: the order rides the party record (destroyed party ⇒ order
 * gone), survives a JSON save/load round-trip, and is own-seat-only in player
 * views. All bit-exact.
 */

const STATS: CombatStatsData = {
  units: [
    { id: 'grunt', attack: 5, defense: 2, health: 12, speed: 5 },
    { id: 'brute', attack: 16, defense: 8, health: 44, speed: 5 },
  ],
  ships: [{ id: 'sloop', hull: 40, cannons: 6, speed: 5 }],
  combat: COMBAT_TUNING,
  tactics: TACTICS_TUNING,
  battle: BATTLE_TUNING,
}

/**
 * The landingParties.test.ts island: one 8×4 island (land x 4–11, y 4–7, with
 * (11,5) a port tile), an isolated one-tile islet at (2,2), deep water
 * elsewhere. Long enough east–west that a 3-point party needs three turns to
 * cross it.
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

function makeParty(
  id: string,
  ownerId: string,
  position: { x: number; y: number },
  troops: { unitId: string; count: number }[],
  marchOrder?: MarchOrder,
): LandingParty {
  return {
    id,
    ownerId,
    name: id,
    position,
    movementPoints: GAME_SETUP.partyMovementPoints,
    maxMovementPoints: GAME_SETUP.partyMovementPoints,
    troops,
    ...(marchOrder ? { marchOrder } : {}),
  }
}

function islandState(opts: {
  parties?: LandingParty[]
  p2City?: boolean
  currentPlayerIndex?: number
}): GameState {
  const seats = [
    { id: 'p1', name: 'One', faction: 'pirates' as const, isAI: false },
    { id: 'p2', name: 'Two', faction: 'british' as const, isAI: false },
  ]
  const cities: CityState[] = opts.p2City
    ? [
        {
          id: 'p2-city',
          ownerId: 'p2',
          name: 'Port Royal',
          position: { x: 11, y: 5 },
          buildings: ['townhall'],
          builtThisRound: false,
          garrison: {},
          unitAvailability: {},
        },
      ]
    : []
  return {
    config: {
      seed: 1,
      mapSize: 'small',
      setup: GAME_SETUP,
      combatStats: STATS,
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
    cities,
    captains: [],
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

/** p1 ends the turn, p2 ends the turn — back to p1 with movement refreshed and orders advanced. */
const CYCLE: Action[] = [
  { type: 'endTurn', playerId: 'p1' },
  { type: 'endTurn', playerId: 'p2' },
]

const marcher = () =>
  islandState({
    parties: [makeParty('lp1', 'p1', { x: 4, y: 4 }, [{ unitId: 'grunt', count: 4 }])],
  })

describe('setMarchOrder (#482)', () => {
  it('marches the first leg immediately and clears the order on same-turn arrival', () => {
    const state = applyAction(marcher(), {
      type: 'setMarchOrder',
      playerId: 'p1',
      partyId: 'lp1',
      destination: { x: 7, y: 4 },
    })
    const party = state.parties[0]!
    expect(party.position).toEqual({ x: 7, y: 4 })
    expect(party.movementPoints).toBe(0)
    expect(JSON.stringify(party)).not.toContain('marchOrder')
  })

  it('marches as far as this turn allows and keeps the order, revealing the route', () => {
    const state = applyAction(marcher(), {
      type: 'setMarchOrder',
      playerId: 'p1',
      partyId: 'lp1',
      destination: { x: 11, y: 4 },
    })
    const party = state.parties[0]!
    expect(party.position).toEqual({ x: 7, y: 4 })
    expect(party.movementPoints).toBe(0)
    expect(party.marchOrder).toEqual({ destination: { x: 11, y: 4 }, knownContactIds: [] })
    expect(state.exploredTiles.p1).toContain('9,4') // vision radius 2 past the stop tile
  })

  it('auto-marches at the start of each of its owner turns until arrival', () => {
    let state = applyAction(marcher(), {
      type: 'setMarchOrder',
      playerId: 'p1',
      partyId: 'lp1',
      destination: { x: 11, y: 4 },
    })
    state = replay(state, CYCLE)
    expect(state.parties[0]!.position).toEqual({ x: 10, y: 4 })
    expect(state.parties[0]!.marchOrder).toBeDefined()
    state = replay(state, CYCLE)
    const party = state.parties[0]!
    expect(party.position).toEqual({ x: 11, y: 4 })
    expect(party.marchOrder).toBeUndefined()
    expect(party.movementPoints).toBe(GAME_SETUP.partyMovementPoints - 1) // one step spent on arrival
  })

  it('rejects water, port, off-map, own-tile, and overland-unreachable destinations', () => {
    const order = (destination: { x: number; y: number }): Action => ({
      type: 'setMarchOrder',
      playerId: 'p1',
      partyId: 'lp1',
      destination,
    })
    expect(() => applyAction(marcher(), order({ x: 3, y: 3 }))).toThrow(/not open land/)
    expect(() => applyAction(marcher(), order({ x: 11, y: 5 }))).toThrow(/not open land/)
    expect(() => applyAction(marcher(), order({ x: 99, y: 4 }))).toThrow(/off-map/)
    expect(() => applyAction(marcher(), order({ x: 4, y: 4 }))).toThrow(/current tile/)
    expect(() => applyAction(marcher(), order({ x: 2, y: 2 }))).toThrow(/not reachable overland/)
    const squatted = {
      ...marcher(),
      parties: [
        ...marcher().parties,
        makeParty('squatter', 'p2', { x: 6, y: 4 }, [{ unitId: 'grunt', count: 1 }]),
      ],
    }
    expect(() => applyAction(squatted, order({ x: 6, y: 4 }))).toThrow(/not reachable overland/)
  })

  it('rejects a party the player does not own', () => {
    expect(() =>
      applyAction(islandState({ parties: [marcher().parties[0]!], currentPlayerIndex: 1 }), {
        type: 'setMarchOrder',
        playerId: 'p2',
        partyId: 'lp1',
        destination: { x: 7, y: 4 },
      }),
    ).toThrow(/owned by/)
  })
})

describe('march-order lifecycle (#482)', () => {
  it('a manual march overrides the standing order', () => {
    const state = islandState({
      parties: [
        makeParty('lp1', 'p1', { x: 4, y: 4 }, [{ unitId: 'grunt', count: 4 }], {
          destination: { x: 11, y: 4 },
          knownContactIds: [],
        }),
      ],
    })
    const next = applyAction(state, {
      type: 'moveParty',
      playerId: 'p1',
      partyId: 'lp1',
      to: { x: 5, y: 5 },
    })
    expect(JSON.stringify(next.parties[0]!)).not.toContain('marchOrder')
  })

  it('clearMarchOrder drops the order and is valid with none set', () => {
    let state = applyAction(marcher(), {
      type: 'setMarchOrder',
      playerId: 'p1',
      partyId: 'lp1',
      destination: { x: 11, y: 4 },
    })
    state = applyAction(state, { type: 'clearMarchOrder', playerId: 'p1', partyId: 'lp1' })
    expect(JSON.stringify(state.parties[0]!)).not.toContain('marchOrder')
    // Idempotent: clearing again is legal.
    expect(() =>
      applyAction(state, { type: 'clearMarchOrder', playerId: 'p1', partyId: 'lp1' }),
    ).not.toThrow()
  })

  it('the order dies with the party: a destroyed marcher never crashes the next turn-start', () => {
    const state = islandState({
      parties: [
        makeParty('lp1', 'p1', { x: 5, y: 4 }, [{ unitId: 'grunt', count: 1 }], {
          destination: { x: 11, y: 4 },
          knownContactIds: ['killer'],
        }),
        // A second p1 party keeps the seat alive once the marcher is destroyed.
        makeParty('reserve', 'p1', { x: 4, y: 7 }, [{ unitId: 'grunt', count: 1 }]),
        makeParty('killer', 'p2', { x: 6, y: 4 }, [{ unitId: 'brute', count: 6 }]),
      ],
      currentPlayerIndex: 1,
    })
    let next = applyAction(state, {
      type: 'attackParty',
      playerId: 'p2',
      partyId: 'killer',
      targetPartyId: 'lp1',
    })
    expect(next.parties.map((p) => p.id)).toEqual(['reserve', 'killer'])
    // p2 ends the turn; p1's auto-march finds no ordered party and does nothing.
    next = applyAction(next, { type: 'endTurn', playerId: 'p2' })
    expect(next.parties.map((p) => p.id)).toEqual(['reserve', 'killer'])
  })
})

describe('march-order interruption (#482)', () => {
  it('pauses at the tile where a NEW enemy contact comes into view', () => {
    let state = islandState({
      parties: [
        makeParty('lp1', 'p1', { x: 4, y: 4 }, [{ unitId: 'grunt', count: 4 }]),
        makeParty('lurker', 'p2', { x: 10, y: 6 }, [{ unitId: 'grunt', count: 1 }]),
      ],
    })
    // Out of sight at set time (distance 6), so the order starts clean.
    state = applyAction(state, {
      type: 'setMarchOrder',
      playerId: 'p1',
      partyId: 'lp1',
      destination: { x: 11, y: 4 },
    })
    expect(state.parties[0]!.position).toEqual({ x: 7, y: 4 })
    expect(state.parties[0]!.marchOrder!.interrupted).toBeUndefined()

    // Next turn the column steps to (8,4), where the lurker enters vision
    // (distance 2) — it halts THERE, mid-stride, with movement left.
    state = replay(state, CYCLE)
    const party = state.parties[0]!
    expect(party.position).toEqual({ x: 8, y: 4 })
    expect(party.movementPoints).toBe(GAME_SETUP.partyMovementPoints - 1)
    expect(party.marchOrder).toMatchObject({ destination: { x: 11, y: 4 }, interrupted: true })
    expect(party.marchOrder!.knownContactIds).toContain('lurker')

    // A paused order stays put on later turns until re-issued or cleared.
    state = replay(state, CYCLE)
    expect(state.parties[0]!.position).toEqual({ x: 8, y: 4 })

    // Re-issuing resumes: the lurker is now baselined and no longer pauses it.
    state = applyAction(state, {
      type: 'setMarchOrder',
      playerId: 'p1',
      partyId: 'lp1',
      destination: { x: 11, y: 4 },
    })
    expect(state.parties[0]!.position).toEqual({ x: 11, y: 4 })
    expect(state.parties[0]!.marchOrder).toBeUndefined()
  })

  it('a contact already visible at set time never pauses the march', () => {
    let state = islandState({
      parties: [
        makeParty('lp1', 'p1', { x: 4, y: 4 }, [{ unitId: 'grunt', count: 4 }]),
        makeParty('known', 'p2', { x: 4, y: 6 }, [{ unitId: 'grunt', count: 1 }]),
      ],
    })
    state = applyAction(state, {
      type: 'setMarchOrder',
      playerId: 'p1',
      partyId: 'lp1',
      destination: { x: 7, y: 4 },
    })
    const party = state.parties[0]!
    expect(party.position).toEqual({ x: 7, y: 4 })
    expect(party.marchOrder).toBeUndefined()
  })

  it('an explored enemy city sighted mid-march is a new contact that pauses the column', () => {
    let state = islandState({
      p2City: true,
      parties: [makeParty('lp1', 'p1', { x: 4, y: 4 }, [{ unitId: 'grunt', count: 4 }])],
    })
    state = applyAction(state, {
      type: 'setMarchOrder',
      playerId: 'p1',
      partyId: 'lp1',
      destination: { x: 11, y: 4 },
    })
    // Turn 2: at (9,4) the port at (11,5) enters vision — halt on the sighting.
    state = replay(state, CYCLE)
    const party = state.parties[0]!
    expect(party.position).toEqual({ x: 9, y: 4 })
    expect(party.marchOrder).toMatchObject({ interrupted: true })
    expect(party.marchOrder!.knownContactIds).toContain('p2-city')
  })

  it('pauses in place when the destination has been squatted since the order was set', () => {
    const state = islandState({
      parties: [
        makeParty('lp1', 'p1', { x: 4, y: 4 }, [{ unitId: 'grunt', count: 4 }], {
          destination: { x: 6, y: 4 },
          knownContactIds: ['squatter'],
        }),
        makeParty('squatter', 'p2', { x: 6, y: 4 }, [{ unitId: 'grunt', count: 1 }]),
      ],
      currentPlayerIndex: 1,
    })
    const next = applyAction(state, { type: 'endTurn', playerId: 'p2' })
    const party = next.parties[0]!
    expect(party.position).toEqual({ x: 4, y: 4 })
    expect(party.movementPoints).toBe(GAME_SETUP.partyMovementPoints)
    expect(party.marchOrder).toMatchObject({ destination: { x: 6, y: 4 }, interrupted: true })
  })
})

describe('replay determinism and serialization (#482)', () => {
  const base = () =>
    islandState({
      parties: [
        makeParty('lp1', 'p1', { x: 4, y: 4 }, [{ unitId: 'grunt', count: 4 }]),
        makeParty('lp2', 'p2', { x: 10, y: 7 }, [{ unitId: 'grunt', count: 2 }]),
      ],
    })

  const LOG: Action[] = [
    { type: 'setMarchOrder', playerId: 'p1', partyId: 'lp1', destination: { x: 11, y: 4 } },
    { type: 'endTurn', playerId: 'p1' },
    { type: 'setMarchOrder', playerId: 'p2', partyId: 'lp2', destination: { x: 4, y: 7 } },
    { type: 'endTurn', playerId: 'p2' },
    { type: 'endTurn', playerId: 'p1' },
    { type: 'clearMarchOrder', playerId: 'p2', partyId: 'lp2' },
    { type: 'endTurn', playerId: 'p2' },
    { type: 'endTurn', playerId: 'p1' },
    { type: 'endTurn', playerId: 'p2' },
  ]

  it('replays a marching campaign byte-identically', () => {
    const a = replay(base(), LOG)
    const b = replay(base(), LOG)
    expect(JSON.stringify(a)).toBe(JSON.stringify(b))
  })

  it('resumes bit-exact from a JSON round-trip at every prefix (order survives save/load)', () => {
    const full = JSON.stringify(replay(base(), LOG))
    const roundTrip = (s: GameState): GameState => JSON.parse(JSON.stringify(s)) as GameState
    for (let k = 0; k <= LOG.length; k++) {
      const stateAtK = replay(base(), LOG.slice(0, k))
      const resumed = replay(roundTrip(stateAtK), LOG.slice(k))
      expect(JSON.stringify(resumed)).toBe(full)
    }
  })
})

describe('player-view filtering (#482)', () => {
  it('discloses the march order on own parties only', () => {
    const state = islandState({
      parties: [
        makeParty('lp1', 'p1', { x: 5, y: 4 }, [{ unitId: 'grunt', count: 4 }], {
          destination: { x: 11, y: 4 },
          knownContactIds: [],
        }),
        // Adjacent p2 party so lp1 is inside p2's vision.
        makeParty('lp2', 'p2', { x: 6, y: 4 }, [{ unitId: 'grunt', count: 1 }]),
      ],
    })
    const own = playerView(state, 'p1').parties.find((p) => p.id === 'lp1')!
    expect(own.marchOrder).toEqual({ destination: { x: 11, y: 4 }, knownContactIds: [] })
    const enemySighting = playerView(state, 'p2').parties.find((p) => p.id === 'lp1')!
    expect(enemySighting).toEqual({
      id: 'lp1',
      ownerId: 'p1',
      name: 'lp1',
      position: { x: 5, y: 4 },
    })
  })
})
