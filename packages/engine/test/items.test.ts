import { describe, expect, it } from 'vitest'
import {
  applyAction,
  applyActionWithOutcome,
  captainToCombatant,
  effectiveCaptainStats,
  playerView,
  replay,
  rollItemDrop,
  RULES_VERSION,
  seedRng,
  type Action,
  type Captain,
  type CityState,
  type ContentCatalog,
  type GameMap,
  type GameState,
  type ItemCatalogLike,
  type LandingParty,
  type Tile,
  type TileType,
} from '../src'
import { GAME_SETUP } from './fixtures'

/**
 * Captain items (#498): seeded drops from sea encounters, land hauls, and land
 * encounters; a per-captain carry cap with faction-stash overflow; stash
 * transfers at an owned port; and passive stat boosts — a carried item raises
 * its captain's attack/defense/speed stats, which feed the flat per-unit
 * combat adds and the movement refresh exactly like trained points. Stash
 * items are inert. Every drop is an RNG draw in the replayed stream, so all of
 * it must replay bit-exact.
 */

/** Drop chances pinned to 1 so every success drops — deterministic branches. */
const ITEM_CATALOG: ItemCatalogLike = {
  defs: {
    cutlass: { stats: { attack: 1, defense: 0, speed: 0 }, weight: 1 },
    charm: { stats: { attack: 0, defense: 2, speed: 0 }, weight: 1 },
    boots: { stats: { attack: 0, defense: 0, speed: 2 }, weight: 1 },
  },
  captainItemCap: 2,
  seaEncounterDropChance: 1,
  landHaulDropChance: 1,
  landEncounterDropChance: 1,
}

const CATALOG: ContentCatalog = {
  buildings: { townhall: { produces: { gold: 100 }, cost: {} } },
  units: {
    grunt: { factionId: 'pirates', tier: 1, goldCost: 25, weeklyGrowth: 8, attack: 5, defense: 2, health: 12 }, // prettier-ignore
  },
  ships: { sloop: { hull: 40, cannons: 6, speed: 5, crewCapacity: 12, upgrades: {} } },
  skills: {},
  captainXpThresholds: [0, 150, 400],
  captainStats: { attackPerPoint: 1, defensePerPoint: 1, speedMovementPerPoint: 1 },
  items: ITEM_CATALOG,
  encounters: {
    merchant: {
      respawnDelay: 0,
      choices: {
        trade: { successChance: 1, reward: { gold: 10 }, xp: 5 },
        rob: { successChance: 0, reward: { gold: 100 } },
      },
    },
    natives: { respawnDelay: 0, choices: { trade: { successChance: 1 } } },
    settlers: { respawnDelay: 0, choices: { recruit: { successChance: 1 } } },
    spawnDensity: 0,
    minStartDistance: 0,
  },
  landSites: {
    sites: {
      ruins: { mode: 'haul', yield: { gold: 50 }, weight: 1 },
      mine: { mode: 'hold', yield: { iron: 1 }, weight: 1 },
    },
    spawnDensity: 0,
    minStartDistance: 0,
  },
  landEncounters: {
    nativeVillage: { respawnDelay: 0, choices: { trade: { successChance: 1, xp: 8 } } },
    hermit: { respawnDelay: 0, choices: { quest: { successChance: 0 } } },
    banditCamp: { respawnDelay: 0, choices: { fight: { successChance: 1 } } },
    spawnDensity: 0,
    minStartDistance: 0,
  },
}

/** Island land x 4–11 / y 4–7, port at (11,5) — same layout as landingParties.test.ts. */
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
  items: string[] = [],
): Captain {
  return {
    id,
    ownerId,
    name: id,
    position,
    shipClassId: 'sloop',
    movementPoints: GAME_SETUP.startingCaptainMovement,
    maxMovementPoints: GAME_SETUP.startingCaptainMovement,
    troops: [{ unitId: 'grunt', count: 2 }],
    xp: 0,
    skills: [],
    stats: { attack: 0, defense: 0, speed: 0 },
    items,
    shipUpgrades: {},
    captured: false,
  }
}

function makeParty(
  id: string,
  ownerId: string,
  position: { x: number; y: number },
  captainId?: string,
): LandingParty {
  return {
    id,
    ownerId,
    name: id,
    position,
    movementPoints: GAME_SETUP.partyMovementPoints,
    maxMovementPoints: GAME_SETUP.partyMovementPoints,
    troops: [{ unitId: 'grunt', count: 3 }],
    ...(captainId !== undefined ? { captainId } : {}),
  }
}

function itemState(opts: {
  captains?: Captain[]
  parties?: LandingParty[]
  p1Stash?: string[]
  p1City?: boolean
  encounterAt?: { x: number; y: number }
  landEncounterAt?: { x: number; y: number }
  siteAt?: { kind: 'ruins' | 'mine'; x: number; y: number }
  content?: ContentCatalog
}): GameState {
  const seats = [
    { id: 'p1', name: 'One', faction: 'pirates' as const, isAI: false },
    { id: 'p2', name: 'Two', faction: 'british' as const, isAI: false },
  ]
  const cities: CityState[] =
    opts.p1City === false
      ? []
      : [
          {
            id: 'p1-city',
            ownerId: 'p1',
            name: 'Tortuga',
            position: { x: 11, y: 5 },
            buildings: ['townhall'],
            builtThisRound: false,
            garrison: {},
            unitAvailability: {},
          },
        ]
  return {
    config: {
      seed: 1,
      mapSize: 'small',
      setup: GAME_SETUP,
      content: opts.content ?? CATALOG,
      players: seats,
      rulesVersion: RULES_VERSION,
    },
    map: islandMap(),
    round: 1,
    currentPlayerIndex: 0,
    players: seats.map((s) => ({
      id: s.id,
      name: s.name,
      faction: s.faction,
      isAI: s.isAI,
      resources: { gold: 500, timber: 0, iron: 0, rum: 0 },
      eliminated: false,
      reputation: 100,
      itemStash: s.id === 'p1' ? (opts.p1Stash ?? []) : [],
    })),
    alliances: { pairs: [], proposals: [] },
    cities,
    captains: opts.captains ?? [],
    parties: opts.parties ?? [],
    encounters: opts.encounterAt
      ? [{ id: 'enc-0', kind: 'merchant', position: opts.encounterAt, active: true, respawnRound: null }] // prettier-ignore
      : [],
    landSites: opts.siteAt
      ? [{ id: 'site-0', kind: opts.siteAt.kind, position: { x: opts.siteAt.x, y: opts.siteAt.y }, active: true }] // prettier-ignore
      : [],
    landEncounters: opts.landEncounterAt
      ? [{ id: 'lenc-0', kind: 'nativeVillage', position: opts.landEncounterAt, active: true, respawnRound: null }] // prettier-ignore
      : [],
    resourceNodes: [],
    exploredTiles: {},
    rngState: seedRng(1),
    actionCount: 0,
    status: 'active',
    winnerId: null,
  }
}

describe('rollItemDrop (#498)', () => {
  it('is deterministic for identical inputs', () => {
    const rng = seedRng(9)
    expect(rollItemDrop(ITEM_CATALOG, 1, rng)).toEqual(rollItemDrop(ITEM_CATALOG, 1, rng))
  })

  it('a zero chance misses with a single draw; weight 0 items are never picked', () => {
    const miss = rollItemDrop(ITEM_CATALOG, 0, seedRng(9))
    expect(miss.itemId).toBeNull()
    const skewed: ItemCatalogLike = {
      ...ITEM_CATALOG,
      defs: {
        cutlass: { stats: { attack: 1, defense: 0, speed: 0 }, weight: 0 },
        charm: { stats: { attack: 0, defense: 2, speed: 0 }, weight: 1 },
      },
    }
    for (let seed = 0; seed < 20; seed++) {
      expect(rollItemDrop(skewed, 1, seedRng(seed)).itemId).toBe('charm')
    }
  })
})

describe('item drops from the three sources (#498)', () => {
  it('a successful sea encounter drops an item to the captain and reports it', () => {
    const state = itemState({
      captains: [makeCaptain('c1', 'p1', { x: 3, y: 3 })],
      encounterAt: { x: 3, y: 2 },
      p1City: false,
    })
    const { state: next, encounterOutcome } = applyActionWithOutcome(state, {
      type: 'resolveEncounter',
      playerId: 'p1',
      captainId: 'c1',
      encounterId: 'enc-0',
      choice: 'trade',
    })
    const item = encounterOutcome!.itemGained!
    expect(Object.keys(ITEM_CATALOG.defs)).toContain(item)
    expect(next.captains[0]!.items).toEqual([item])
    expect(next.players[0]!.itemStash).toEqual([])
    expect(next.rngState).not.toBe(state.rngState)
  })

  it('a failed encounter drops nothing', () => {
    const state = itemState({
      captains: [makeCaptain('c1', 'p1', { x: 3, y: 3 })],
      encounterAt: { x: 3, y: 2 },
      p1City: false,
    })
    const { state: next, encounterOutcome } = applyActionWithOutcome(state, {
      type: 'resolveEncounter',
      playerId: 'p1',
      captainId: 'c1',
      encounterId: 'enc-0',
      choice: 'rob',
    })
    expect(encounterOutcome!.success).toBe(false)
    expect(encounterOutcome!.itemGained).toBeUndefined()
    expect(next.captains[0]!.items).toEqual([])
  })

  it('a find beyond the carry cap overflows to the faction stash', () => {
    const state = itemState({
      captains: [makeCaptain('c1', 'p1', { x: 3, y: 3 }, ['cutlass', 'charm'])],
      encounterAt: { x: 3, y: 2 },
      p1City: false,
    })
    const { state: next, encounterOutcome } = applyActionWithOutcome(state, {
      type: 'resolveEncounter',
      playerId: 'p1',
      captainId: 'c1',
      encounterId: 'enc-0',
      choice: 'trade',
    })
    expect(next.captains[0]!.items).toEqual(['cutlass', 'charm'])
    expect(next.players[0]!.itemStash).toEqual([encounterOutcome!.itemGained])
  })

  it('a haul site capture finds an item for the leading captain, else the stash', () => {
    const led = itemState({
      captains: [makeCaptain('c1', 'p1', { x: 3, y: 5 })],
      parties: [makeParty('lp1', 'p1', { x: 6, y: 5 }, 'c1')],
      siteAt: { kind: 'ruins', x: 6, y: 5 },
      p1City: false,
    })
    const capture: Action = { type: 'captureSite', playerId: 'p1', partyId: 'lp1', siteId: 'site-0' } // prettier-ignore
    const next = applyAction(led, capture)
    expect(next.captains[0]!.items).toHaveLength(1)
    expect(next.players[0]!.itemStash).toEqual([])

    const unled = itemState({
      parties: [makeParty('lp1', 'p1', { x: 6, y: 5 })],
      siteAt: { kind: 'ruins', x: 6, y: 5 },
      p1City: false,
    })
    const next2 = applyAction(unled, capture)
    expect(next2.players[0]!.itemStash).toHaveLength(1)
  })

  it('a hold-site capture draws no item and no RNG', () => {
    const state = itemState({
      parties: [makeParty('lp1', 'p1', { x: 6, y: 5 })],
      siteAt: { kind: 'mine', x: 6, y: 5 },
      p1City: false,
    })
    const next = applyAction(state, {
      type: 'captureSite',
      playerId: 'p1',
      partyId: 'lp1',
      siteId: 'site-0',
    })
    expect(next.rngState).toBe(state.rngState)
    expect(next.players[0]!.itemStash).toEqual([])
  })

  it('a successful land encounter drops to the leader, who also banks the XP', () => {
    const state = itemState({
      captains: [makeCaptain('c1', 'p1', { x: 3, y: 5 })],
      parties: [makeParty('lp1', 'p1', { x: 6, y: 5 }, 'c1')],
      landEncounterAt: { x: 6, y: 4 },
      p1City: false,
    })
    const { state: next, encounterOutcome } = applyActionWithOutcome(state, {
      type: 'resolvePartyEncounter',
      playerId: 'p1',
      partyId: 'lp1',
      encounterId: 'lenc-0',
      choice: 'trade',
    })
    expect(encounterOutcome!.xpGained).toBe(8)
    const cap = next.captains[0]!
    expect(cap.xp).toBe(8)
    expect(cap.items).toEqual([encounterOutcome!.itemGained])
  })

  it('an unled party sends the land-encounter find to the stash and banks no XP', () => {
    const state = itemState({
      parties: [makeParty('lp1', 'p1', { x: 6, y: 5 })],
      landEncounterAt: { x: 6, y: 4 },
      p1City: false,
    })
    const { state: next, encounterOutcome } = applyActionWithOutcome(state, {
      type: 'resolvePartyEncounter',
      playerId: 'p1',
      partyId: 'lp1',
      encounterId: 'lenc-0',
      choice: 'trade',
    })
    expect(encounterOutcome!.xpGained).toBe(0)
    expect(next.players[0]!.itemStash).toHaveLength(1)
  })

  it('a catalog without item content drops nothing and draws no item RNG', () => {
    const { items: _drop, ...noItems } = CATALOG
    const state = itemState({
      captains: [makeCaptain('c1', 'p1', { x: 3, y: 3 })],
      encounterAt: { x: 3, y: 2 },
      p1City: false,
      content: noItems as ContentCatalog,
    })
    const { state: next, encounterOutcome } = applyActionWithOutcome(state, {
      type: 'resolveEncounter',
      playerId: 'p1',
      captainId: 'c1',
      encounterId: 'enc-0',
      choice: 'trade',
    })
    expect(encounterOutcome!.itemGained).toBeUndefined()
    expect(next.captains[0]!.items).toEqual([])
  })
})

// c1 docked beside p1's own city at (11,5) — the stash-transfer station.
const DOCK = { x: 12, y: 5 }

describe('takeItem / depositItem (#498)', () => {
  it('moves an item from the stash to a docked captain and back', () => {
    const state = itemState({
      captains: [makeCaptain('c1', 'p1', DOCK)],
      p1Stash: ['cutlass', 'boots'],
    })
    const taken = applyAction(state, {
      type: 'takeItem',
      playerId: 'p1',
      captainId: 'c1',
      cityId: 'p1-city',
      itemId: 'boots',
    })
    expect(taken.captains[0]!.items).toEqual(['boots'])
    expect(taken.players[0]!.itemStash).toEqual(['cutlass'])

    const returned = applyAction(taken, {
      type: 'depositItem',
      playerId: 'p1',
      captainId: 'c1',
      cityId: 'p1-city',
      itemId: 'boots',
    })
    expect(returned.captains[0]!.items).toEqual([])
    expect(returned.players[0]!.itemStash).toEqual(['cutlass', 'boots'])
  })

  it('rejects transfers away from port, of items not held, and past the carry cap', () => {
    const far = itemState({
      captains: [makeCaptain('c1', 'p1', { x: 3, y: 3 })],
      p1Stash: ['cutlass'],
    })
    expect(
      () =>
      applyAction(far, { type: 'takeItem', playerId: 'p1', captainId: 'c1', cityId: 'p1-city', itemId: 'cutlass' }), // prettier-ignore
    ).toThrow(/not docked/)

    const state = itemState({
      captains: [makeCaptain('c1', 'p1', DOCK, ['charm', 'boots'])],
      p1Stash: ['cutlass'],
    })
    expect(
      () =>
      applyAction(state, { type: 'takeItem', playerId: 'p1', captainId: 'c1', cityId: 'p1-city', itemId: 'boots' }), // prettier-ignore
    ).toThrow(/stash/)
    expect(
      () =>
      applyAction(state, { type: 'takeItem', playerId: 'p1', captainId: 'c1', cityId: 'p1-city', itemId: 'cutlass' }), // prettier-ignore
    ).toThrow(/already carries/)
    expect(
      () =>
      applyAction(state, { type: 'depositItem', playerId: 'p1', captainId: 'c1', cityId: 'p1-city', itemId: 'cutlass' }), // prettier-ignore
    ).toThrow(/does not carry/)
  })
})

describe('passive item effects (#498: carried items boost stats)', () => {
  it('carried items raise effective stats, feeding the flat per-unit combat adds', () => {
    const cap = makeCaptain('c1', 'p1', DOCK, ['cutlass', 'charm'])
    expect(effectiveCaptainStats(cap, CATALOG)).toEqual({ attack: 1, defense: 2, speed: 0 })
    const combatant = captainToCombatant(cap, CATALOG)
    // 1 attack + 2 defense stat points × 1/pt flat; the percent channel is skills-only.
    expect(combatant.attackFlatBonus).toBe(1)
    expect(combatant.defenseFlatBonus).toBe(2)
    expect(combatant.attackBonusPct).toBe(0)
    expect(combatant.defenseBonusPct).toBe(0)
  })

  it('item boosts stack on top of trained points', () => {
    const cap: Captain = {
      ...makeCaptain('c1', 'p1', DOCK, ['cutlass']),
      stats: { attack: 2, defense: 0, speed: 0 },
    }
    expect(effectiveCaptainStats(cap, CATALOG).attack).toBe(3)
    expect(captainToCombatant(cap, CATALOG).attackFlatBonus).toBe(3)
  })

  it('every item in a full hold counts — all carried slots are live at the cap', () => {
    // captainItemCap is 2 in this catalog; both carried items boost.
    const cap = makeCaptain('c1', 'p1', DOCK, ['cutlass', 'cutlass'])
    expect(cap.items).toHaveLength(ITEM_CATALOG.captainItemCap)
    expect(effectiveCaptainStats(cap, CATALOG).attack).toBe(2)
  })

  it('stash items are inert — only the carrying captain is boosted', () => {
    const state = itemState({
      captains: [makeCaptain('c1', 'p1', DOCK)],
      p1Stash: ['cutlass', 'charm'],
    })
    const cap = state.captains[0]!
    expect(effectiveCaptainStats(cap, CATALOG)).toEqual({ attack: 0, defense: 0, speed: 0 })
    expect(captainToCombatant(cap, CATALOG).attackFlatBonus).toBe(0)
  })

  it('item speed adds to the movement allowance at refresh', () => {
    let state = itemState({ captains: [makeCaptain('c1', 'p1', DOCK, ['boots'])] })
    state = applyAction(state, { type: 'endTurn', playerId: 'p1' })
    state = applyAction(state, { type: 'endTurn', playerId: 'p2' })
    expect(state.captains[0]!.movementPoints).toBe(GAME_SETUP.startingCaptainMovement + 2)
  })

  it('a speed item taken mid-turn moves the ship from the NEXT refresh, never retroactively', () => {
    const state = itemState({
      captains: [makeCaptain('c1', 'p1', DOCK)],
      p1Stash: ['boots'],
    })
    const before = state.captains[0]!.movementPoints
    let next = applyAction(state, {
      type: 'takeItem',
      playerId: 'p1',
      captainId: 'c1',
      cityId: 'p1-city',
      itemId: 'boots',
    })
    expect(next.captains[0]!.movementPoints).toBe(before)
    next = applyAction(next, { type: 'endTurn', playerId: 'p1' })
    next = applyAction(next, { type: 'endTurn', playerId: 'p2' })
    expect(next.captains[0]!.movementPoints).toBe(GAME_SETUP.startingCaptainMovement + 2)
  })
})

describe('item fog of war and replay (#498)', () => {
  it('disclosed items and stash to the owner only', () => {
    const state = itemState({
      captains: [makeCaptain('c1', 'p1', DOCK, ['cutlass']), makeCaptain('c2', 'p2', DOCK)],
      p1Stash: ['charm'],
    })
    const own = playerView(state, 'p1')
    expect(own.captains.find((c) => c.id === 'c1')!.items).toEqual(['cutlass'])
    expect(own.players.find((p) => p.id === 'p1')!.itemStash).toEqual(['charm'])
    const enemy = playerView(state, 'p2')
    expect(enemy.captains.find((c) => c.id === 'c1')!.items).toBeUndefined()
    expect(enemy.players.find((p) => p.id === 'p1')!.itemStash).toBeUndefined()
  })

  it('replays an encounter-drop log to an identical state', () => {
    const base = itemState({
      captains: [makeCaptain('c1', 'p1', { x: 3, y: 3 })],
      encounterAt: { x: 3, y: 2 },
      p1City: false,
    })
    const log: Action[] = [
      { type: 'resolveEncounter', playerId: 'p1', captainId: 'c1', encounterId: 'enc-0', choice: 'trade' }, // prettier-ignore
    ]
    const a = replay(base, log)
    const b = replay(base, log)
    expect(JSON.stringify(a)).toBe(JSON.stringify(b))
    expect(a.captains[0]!.items).toHaveLength(1)
  })
})
