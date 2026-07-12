import { describe, expect, it } from 'vitest'
import {
  applyAction,
  applyActionWithOutcome,
  createGame,
  mapNeighbors,
  playerIncome,
  replay,
  RULES_VERSION,
  seedRng,
  tileAt,
  type Action,
  type CityState,
  type CombatStatsData,
  type ContentCatalog,
  type GameConfig,
  type GameMap,
  type GameState,
  type LandEncounterState,
  type LandingParty,
  type LandSiteState,
  type Tile,
  type TileType,
} from '../src'
import { BATTLE_TUNING, COMBAT_TUNING, GAME_SETUP, TACTICS_TUNING } from './fixtures'

/**
 * Land content (#466/#467): the replay contract for the two new actions
 * (`captureSite`, `resolvePartyEncounter`), the persistent hold-site claim and
 * its per-round income, and the deterministic seeding of land sites, land
 * encounters, and inland neutral settlements — the last unreachable by sea by
 * construction. All bit-exact.
 */

const UNITS = [
  { id: 'grunt', attack: 5, defense: 2, health: 12, speed: 5 },
  { id: 'brute', attack: 16, defense: 8, health: 44, speed: 5 },
  { id: 'b1', attack: 3, defense: 1, health: 7, speed: 5 },
  { id: 'turret:pirates:1', attack: 3, defense: 0, health: 7, speed: 3, range: 4, stationary: true }, // prettier-ignore
]

const STATS: CombatStatsData = {
  units: UNITS,
  ships: [{ id: 'sloop', hull: 40, cannons: 6, speed: 5 }],
  combat: COMBAT_TUNING,
  tactics: TACTICS_TUNING,
  battle: BATTLE_TUNING,
}

const CATALOG: ContentCatalog = {
  buildings: {
    townhall: { produces: { gold: 100 }, cost: {}, unlocksTier: 1 },
    barracks: { produces: {}, cost: {}, unlocksTier: 1, requires: 'townhall' },
    shipyard: { produces: {}, cost: { gold: 100 }, requires: 'townhall', unlocksShipyard: true },
  },
  units: {
    grunt: { factionId: 'pirates', tier: 1, goldCost: 25, weeklyGrowth: 8, attack: 5, defense: 2, health: 12 }, // prettier-ignore
    brute: { factionId: 'pirates', tier: 3, goldCost: 150, weeklyGrowth: 2, attack: 16, defense: 8, health: 44 }, // prettier-ignore
    b1: { factionId: 'british', tier: 1, goldCost: 25, weeklyGrowth: 8, attack: 3, defense: 1, health: 7 }, // prettier-ignore
  },
  ships: { sloop: { hull: 40, cannons: 6, speed: 5, crewCapacity: 12, upgrades: {} } },
  skills: {},
  captainXpThresholds: [0, 150, 400, 800, 1400],
  cityDefense: { militiaPerType: 3, turretCount: 2, neutralRosterFactionId: 'pirates' },
  landSites: {
    sites: {
      mine: { mode: 'hold', yield: { gold: 40, iron: 3 }, weight: 3 },
      sawmill: { mode: 'hold', yield: { timber: 5 }, weight: 3 },
      lumberCamp: { mode: 'haul', yield: { timber: 45 }, weight: 2 },
      ruins: { mode: 'haul', yield: { gold: 240, rum: 8 }, weight: 2 },
    },
    spawnDensity: 0.05,
    minStartDistance: 3,
  },
  landEncounters: {
    nativeVillage: {
      respawnDelay: 5,
      choices: {
        recruit: { successChance: 1, cost: { gold: 100 }, grantUnitByFaction: { pirates: 'grunt' }, grantCount: 5, xp: 5 }, // prettier-ignore
      },
    },
    hermit: { respawnDelay: 6, choices: { quest: { successChance: 1, reward: { gold: 200 } } } },
    banditCamp: { respawnDelay: 4, choices: { raid: { successChance: 1, reward: { gold: 300 } } } },
    spawnDensity: 0.02,
    minStartDistance: 3,
  },
  inlandSettlements: { density: 1, buildings: ['townhall', 'barracks'] },
}

/** The same 8×4 island as landingParties.test.ts, with (11,5) a port for p2's city. */
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

function landState(opts: {
  parties?: LandingParty[]
  landSites?: LandSiteState[]
  landEncounters?: LandEncounterState[]
  cities?: CityState[]
  currentPlayerIndex?: number
}): GameState {
  const seats = [
    { id: 'p1', name: 'One', faction: 'pirates' as const, isAI: false },
    { id: 'p2', name: 'Two', faction: 'british' as const, isAI: false },
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
      resources: { gold: 500, timber: 0, iron: 0, rum: 0 },
      eliminated: false,
      reputation: 100,
    })),
    alliances: { pairs: [], proposals: [] },
    cities: opts.cities ?? [],
    captains: [],
    parties: opts.parties ?? [],
    encounters: [],
    landSites: opts.landSites ?? [],
    landEncounters: opts.landEncounters ?? [],
    resourceNodes: [],
    exploredTiles: {},
    rngState: seedRng(1),
    actionCount: 0,
    status: 'active',
    winnerId: null,
  }
}

const site = (id: string, kind: LandSiteState['kind'], position: { x: number; y: number }): LandSiteState => ({ id, kind, position, active: true }) // prettier-ignore

describe('captureSite — hold sites (#466)', () => {
  const base = () =>
    landState({
      parties: [makeParty('lp1', 'p1', { x: 6, y: 5 }, [{ unitId: 'grunt', count: 4 }])],
      landSites: [site('site-0', 'mine', { x: 6, y: 5 })],
    })
  const claim: Action = { type: 'captureSite', playerId: 'p1', partyId: 'lp1', siteId: 'site-0' }

  it('sets a persistent claim, spends the party, and keeps the site active', () => {
    const state = applyAction(base(), claim)
    expect(state.landSites[0]).toEqual({
      id: 'site-0',
      kind: 'mine',
      position: { x: 6, y: 5 },
      active: true,
      claimedBy: 'p1',
    })
    expect(state.parties[0]!.movementPoints).toBe(0)
  })

  it('keeps paying after the party marches off, until an enemy party retakes it', () => {
    let state = applyAction(base(), claim)
    // Claim persists even with no party on the tile.
    state = { ...state, parties: [] }
    expect(playerIncome(state, 'p1', CATALOG)).toEqual({ gold: 40, timber: 0, iron: 3, rum: 0 })
    expect(playerIncome(state, 'p2', CATALOG)).toEqual({ gold: 0, timber: 0, iron: 0, rum: 0 })

    // A rival party stands on it and captures it: the claim flips.
    state = {
      ...state,
      currentPlayerIndex: 1,
      parties: [makeParty('lp2', 'p2', { x: 6, y: 5 }, [{ unitId: 'b1', count: 2 }])],
    }
    state = applyAction(state, {
      type: 'captureSite',
      playerId: 'p2',
      partyId: 'lp2',
      siteId: 'site-0',
    })
    expect(state.landSites[0]!.claimedBy).toBe('p2')
    expect(playerIncome(state, 'p1', CATALOG)).toEqual({ gold: 0, timber: 0, iron: 0, rum: 0 })
    expect(playerIncome(state, 'p2', CATALOG)).toEqual({ gold: 40, timber: 0, iron: 3, rum: 0 })
  })

  it('hold-site income reaches the treasury on round advance', () => {
    let state = applyAction(base(), claim)
    state = applyAction(state, { type: 'endTurn', playerId: 'p1' })
    state = applyAction(state, { type: 'endTurn', playerId: 'p2' })
    expect(state.round).toBe(2)
    expect(state.players.find((p) => p.id === 'p1')!.resources).toEqual({
      gold: 500 + 40,
      timber: 0,
      iron: 3,
      rum: 0,
    })
  })

  it('rejects re-claiming a site this seat already holds, and a spent party', () => {
    const held = applyAction(base(), claim)
    const refreshed = {
      ...held,
      parties: held.parties.map((p) => ({ ...p, movementPoints: GAME_SETUP.partyMovementPoints })),
    }
    expect(() => applyAction(refreshed, claim)).toThrow(/already holds/)
    const spent = {
      ...base(),
      parties: base().parties.map((p) => ({ ...p, movementPoints: 0 })),
    }
    expect(() => applyAction(spent, claim)).toThrow(/no movement/)
  })
})

describe('captureSite — haul sites (#466)', () => {
  const base = () =>
    landState({
      parties: [makeParty('lp1', 'p1', { x: 6, y: 5 }, [{ unitId: 'grunt', count: 4 }])],
      landSites: [site('site-0', 'ruins', { x: 6, y: 5 })],
    })
  const grab: Action = { type: 'captureSite', playerId: 'p1', partyId: 'lp1', siteId: 'site-0' }

  it('pays a one-time haul, spends the site, and never carries a claim', () => {
    const state = applyAction(base(), grab)
    expect(state.players.find((p) => p.id === 'p1')!.resources).toEqual({
      gold: 500 + 240,
      timber: 0,
      iron: 0,
      rum: 8,
    })
    expect(state.landSites[0]).toEqual({
      id: 'site-0',
      kind: 'ruins',
      position: { x: 6, y: 5 },
      active: false,
    })
    // A spent haul site yields no ongoing income and can't be captured again.
    expect(playerIncome(state, 'p1', CATALOG)).toEqual({ gold: 0, timber: 0, iron: 0, rum: 0 })
    const refreshed = {
      ...state,
      parties: state.parties.map((p) => ({ ...p, movementPoints: GAME_SETUP.partyMovementPoints })),
    }
    expect(() => applyAction(refreshed, grab)).toThrow(/No active land site/)
  })

  it('rejects capturing a site the party is not standing on', () => {
    const off = landState({
      parties: [makeParty('lp1', 'p1', { x: 7, y: 5 }, [{ unitId: 'grunt', count: 4 }])],
      landSites: [site('site-0', 'ruins', { x: 6, y: 5 })],
    })
    expect(() => applyAction(off, grab)).toThrow(/must stand on/)
  })
})

describe('resolvePartyEncounter (#466)', () => {
  const village = () =>
    landState({
      parties: [makeParty('lp1', 'p1', { x: 6, y: 5 }, [{ unitId: 'grunt', count: 4 }])],
      landEncounters: [
        { id: 'lenc-0', kind: 'nativeVillage', position: { x: 7, y: 5 }, active: true, respawnRound: null }, // prettier-ignore
      ],
    })
  const recruit: Action = {
    type: 'resolvePartyEncounter',
    playerId: 'p1',
    partyId: 'lp1',
    encounterId: 'lenc-0',
    choice: 'recruit',
  }

  it('resolves with the adjacent party: pays cost, grants troops (no crew cap), spends movement', () => {
    const { state, encounterOutcome } = applyActionWithOutcome(village(), recruit)
    expect(encounterOutcome?.success).toBe(true)
    expect(encounterOutcome?.kind).toBe('nativeVillage')
    const party = state.parties[0]!
    expect(party.troops).toEqual([{ unitId: 'grunt', count: 9 }]) // 4 + 5 recruited
    expect(party.movementPoints).toBe(0)
    expect(state.players.find((p) => p.id === 'p1')!.resources.gold).toBe(400)
    const encounter = state.landEncounters[0]!
    expect(encounter.active).toBe(false)
    expect(encounter.respawnRound).toBe(1 + 5)
  })

  it('rejects an out-of-reach party and an unaffordable choice', () => {
    const far = landState({
      parties: [makeParty('lp1', 'p1', { x: 4, y: 5 }, [{ unitId: 'grunt', count: 4 }])],
      landEncounters: [
        { id: 'lenc-0', kind: 'nativeVillage', position: { x: 10, y: 5 }, active: true, respawnRound: null }, // prettier-ignore
      ],
    })
    expect(() => applyAction(far, recruit)).toThrow(/not within reach/)
    const broke = village()
    broke.players.find((p) => p.id === 'p1')!.resources.gold = 10
    expect(() => applyAction(broke, recruit)).toThrow(/cannot afford/)
  })

  it('reactivates a consumed land encounter once its respawn round arrives', () => {
    let state = applyAction(village(), recruit)
    expect(state.landEncounters[0]!.active).toBe(false)
    for (let i = 0; i < 5; i++) {
      state = applyAction(state, { type: 'endTurn', playerId: 'p1' })
      state = applyAction(state, { type: 'endTurn', playerId: 'p2' })
    }
    expect(state.round).toBe(6)
    expect(state.landEncounters[0]!.active).toBe(true)
    expect(state.landEncounters[0]!.respawnRound).toBeNull()
  })
})

describe('inland settlements (#467)', () => {
  // p1 owns a captured inland city at interior tile (6,5); p2 owns the coastal port city.
  const inlandCity = (ownerId: string): CityState => ({
    id: 'inland',
    ownerId,
    name: 'Hollow Ridge (Free)',
    position: { x: 6, y: 5 },
    buildings: ['townhall', 'barracks'],
    builtThisRound: false,
    garrison: {},
    unitAvailability: {},
  })

  it('is captured overland by a party assault, facing the full neutral defense', () => {
    const strong = landState({
      parties: [makeParty('lp1', 'p1', { x: 6, y: 6 }, [{ unitId: 'brute', count: 30 }])],
      cities: [inlandCity('neutral')],
    })
    const { state, battleReport } = applyActionWithOutcome(strong, {
      type: 'partyAssaultCity',
      playerId: 'p1',
      partyId: 'lp1',
      targetCityId: 'inland',
    })
    expect(battleReport?.winnerId).toBe('p1')
    expect(state.cities[0]!.ownerId).toBe('p1')

    // A token party can't grab it — the neutral roster fields militia + turrets.
    const weak = landState({
      parties: [makeParty('lp1', 'p1', { x: 6, y: 6 }, [{ unitId: 'grunt', count: 1 }])],
      cities: [inlandCity('neutral')],
    })
    const after = applyAction(weak, {
      type: 'partyAssaultCity',
      playerId: 'p1',
      partyId: 'lp1',
      targetCityId: 'inland',
    })
    expect(after.cities[0]!.ownerId).toBe('neutral')
    expect(after.parties).toEqual([])
  })

  it('cannot build a shipyard once owned — it is landlocked', () => {
    const owned = landState({ cities: [inlandCity('p1')] })
    expect(() =>
      applyAction(owned, {
        type: 'construct',
        playerId: 'p1',
        cityId: 'inland',
        buildingId: 'shipyard',
      }),
    ).toThrow(/coastline|landlocked/)
    // A coastal city (adjacent to open water) can build it.
    const coastal = landState({
      cities: [{ ...inlandCity('p1'), id: 'coast', position: { x: 4, y: 4 } }],
    })
    const built = applyAction(coastal, {
      type: 'construct',
      playerId: 'p1',
      cityId: 'coast',
      buildingId: 'shipyard',
    })
    expect(built.cities[0]!.buildings).toContain('shipyard')
  })
})

describe('mapgen land content is deterministic and reachable-only-overland (#466/#467)', () => {
  const config = (): GameConfig => ({
    seed: 42,
    mapSize: 'xlarge',
    players: [
      { id: 'p1', name: 'One', faction: 'pirates', isAI: false },
      { id: 'p2', name: 'Two', faction: 'british', isAI: false },
    ],
    setup: GAME_SETUP,
    combatStats: STATS,
    content: CATALOG,
  })

  it('produces byte-identical land content across two builds of the same seed', () => {
    const a = createGame(config())
    const b = createGame(config())
    expect(JSON.stringify(a.landSites)).toBe(JSON.stringify(b.landSites))
    expect(JSON.stringify(a.landEncounters)).toBe(JSON.stringify(b.landEncounters))
    expect(JSON.stringify(a.cities)).toBe(JSON.stringify(b.cities))
  })

  it('seeds neutral inland settlements on interior tiles no ship can reach', () => {
    const game = createGame(config())
    const neutrals = game.cities.filter((c) => c.ownerId === 'neutral')
    expect(neutrals.length).toBeGreaterThan(0)
    for (const city of neutrals) {
      expect(city.buildings).not.toContain('shipyard')
      expect(tileAt(game.map, city.position)!.type).toBe('land')
      // Every neighbour is land ⇒ no water within distance 1 ⇒ no sea assault.
      expect(mapNeighbors(game.map, city.position).every((n) => tileAt(game.map, n)?.type === 'land')).toBe(true) // prettier-ignore
    }
  })

  it('scatters land sites and land encounters, all on land tiles', () => {
    const game = createGame(config())
    expect(game.landSites.length).toBeGreaterThan(0)
    expect(game.landEncounters.length).toBeGreaterThan(0)
    for (const s of game.landSites) expect(tileAt(game.map, s.position)!.type).toBe('land')
    for (const e of game.landEncounters) expect(tileAt(game.map, e.position)!.type).toBe('land')
  })

  it('leaves the live RNG stream untouched — land placement uses a separate stream', () => {
    const withLand = createGame(config())
    const noLandCatalog = { ...CATALOG }
    delete noLandCatalog.landSites
    delete noLandCatalog.landEncounters
    delete noLandCatalog.inlandSettlements
    const withoutLand = createGame({ ...config(), content: noLandCatalog })
    // The combat/encounter RNG state is identical whether or not land content
    // was scattered — the sim battery therefore can't be perturbed by it.
    expect(withLand.rngState).toBe(withoutLand.rngState)
  })
})

describe('replay determinism — land content campaign (#466/#467)', () => {
  const base = () =>
    landState({
      parties: [makeParty('lp1', 'p1', { x: 6, y: 5 }, [{ unitId: 'grunt', count: 4 }])],
      landSites: [site('site-0', 'mine', { x: 6, y: 5 }), site('site-1', 'ruins', { x: 5, y: 5 })],
      landEncounters: [
        {
          id: 'lenc-0',
          kind: 'hermit',
          position: { x: 7, y: 5 },
          active: true,
          respawnRound: null,
        },
      ],
    })

  const LOG: readonly Action[] = [
    { type: 'captureSite', playerId: 'p1', partyId: 'lp1', siteId: 'site-0' },
    { type: 'endTurn', playerId: 'p1' },
    { type: 'endTurn', playerId: 'p2' },
    { type: 'resolvePartyEncounter', playerId: 'p1', partyId: 'lp1', encounterId: 'lenc-0', choice: 'quest' }, // prettier-ignore
    { type: 'endTurn', playerId: 'p1' },
    { type: 'endTurn', playerId: 'p2' },
    { type: 'moveParty', playerId: 'p1', partyId: 'lp1', to: { x: 5, y: 5 } },
    { type: 'captureSite', playerId: 'p1', partyId: 'lp1', siteId: 'site-1' },
  ]

  it('replays byte-identically', () => {
    const a = replay(base(), LOG)
    const b = replay(base(), LOG)
    expect(JSON.stringify(a)).toBe(JSON.stringify(b))
    expect(a.landSites.find((s) => s.id === 'site-0')!.claimedBy).toBe('p1')
    expect(a.landSites.find((s) => s.id === 'site-1')!.active).toBe(false)
  })

  it('resumes bit-exact from a JSON round-trip at every prefix', () => {
    const full = JSON.stringify(replay(base(), LOG))
    const roundTrip = (s: GameState): GameState => JSON.parse(JSON.stringify(s)) as GameState
    for (let k = 1; k < LOG.length; k++) {
      const at = replay(base(), LOG.slice(0, k))
      const resumed = replay(roundTrip(at), LOG.slice(k))
      expect(JSON.stringify(resumed)).toBe(full)
    }
  })
})
