import { describe, expect, it } from 'vitest'
import {
  applyAction,
  applyActionWithOutcome,
  captainAwaitingCommand,
  partyToCombatant,
  playerView,
  replay,
  RULES_VERSION,
  seedRng,
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
 * Captain-led landing parties (#498): `disembark { withCaptain }` puts the
 * captain ashore with the column — its bonuses apply to the party's battles,
 * it banks their XP and finds — while its ship sits anchored and orderless.
 * If the anchored ship loses a naval defense the SHIP is lost (prize flow)
 * but the captain is NOT captured: the party fights on stranded, and only its
 * destruction captures the captain. `embark` onto the own ship reunites them.
 * All bit-exact from the action log.
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
  buildings: {
    townhall: { produces: { gold: 100 }, cost: {}, unlocksTier: 1 },
    // Rescue re-commissioning (#499) goes through recruitCaptain's tavern gate.
    tavern: { produces: {}, cost: {}, unlocksCaptains: true },
  },
  units: {
    grunt: { factionId: 'pirates', tier: 1, goldCost: 25, weeklyGrowth: 8, attack: 5, defense: 2, health: 12 }, // prettier-ignore
    brute: { factionId: 'pirates', tier: 3, goldCost: 150, weeklyGrowth: 2, attack: 16, defense: 8, health: 44 }, // prettier-ignore
    b1: { factionId: 'british', tier: 1, goldCost: 25, weeklyGrowth: 8, attack: 3, defense: 1, health: 7 }, // prettier-ignore
  },
  ships: { sloop: { hull: 40, cannons: 6, speed: 5, crewCapacity: 12, upgrades: {} } },
  skills: {
    'pirates-gunnery-1': { factionId: 'pirates', tier: 1, attackBonusPct: 10, defenseBonusPct: 0 },
  },
  captainXpThresholds: [0, 150, 400],
  captainStats: { attackPerPoint: 1, defensePerPoint: 1, speedMovementPerPoint: 1 },
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
  captainId?: string,
): LandingParty {
  return {
    id,
    ownerId,
    name: id,
    position,
    movementPoints: GAME_SETUP.partyMovementPoints,
    maxMovementPoints: GAME_SETUP.partyMovementPoints,
    troops,
    ...(captainId !== undefined ? { captainId } : {}),
  }
}

function ledState(opts: {
  captains?: Captain[]
  parties?: LandingParty[]
  p2City?: boolean
  garrison?: Record<string, number>
  garrisonCaptainId?: string
  currentPlayerIndex?: number
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
            ...(opts.garrisonCaptainId !== undefined
              ? { garrisonCaptainId: opts.garrisonCaptainId }
              : {}),
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
      itemStash: [],
    })),
    alliances: { pairs: [], proposals: [] },
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

describe('disembark withCaptain (#498)', () => {
  const base = () =>
    ledState({
      captains: [makeCaptain('c1', 'p1', { x: 3, y: 4 }, [{ unitId: 'grunt', count: 6 }])],
      p2City: false,
    })

  it('lands the party led, anchors the ship: movement spent, sail order cleared', () => {
    const withOrder: GameState = {
      ...base(),
      captains: base().captains.map((c) => ({
        ...c,
        sailOrder: { destination: { x: 1, y: 1 }, knownContactIds: [] },
      })),
    }
    const next = applyAction(withOrder, {
      type: 'disembark',
      playerId: 'p1',
      captainId: 'c1',
      to: { x: 4, y: 4 },
      troops: [{ unitId: 'grunt', count: 4 }],
      withCaptain: true,
    })
    expect(next.parties[0]!.captainId).toBe('c1')
    const cap = next.captains[0]!
    expect(cap.movementPoints).toBe(0)
    expect(cap.sailOrder).toBeUndefined()
    expect(cap.troops).toEqual([{ unitId: 'grunt', count: 2 }])
  })

  it('a garrisoned captain cannot disembark at all', () => {
    const state = ledState({
      captains: [{ ...makeCaptain('c2', 'p2', { x: 12, y: 5 }, [{ unitId: 'b1', count: 4 }]) }],
      garrisonCaptainId: 'c2',
      currentPlayerIndex: 1,
    })
    expect(() =>
      applyAction(state, {
        type: 'disembark',
        playerId: 'p2',
        captainId: 'c2',
        to: { x: 11, y: 4 },
        troops: [{ unitId: 'b1', count: 1 }],
        withCaptain: true,
      }),
    ).toThrow(/garrisoned/)
  })
})

/** p1's captain ashore leading lp1 at (4,4); its ship anchored at (3,4). */
function ashoreState(extra?: Partial<Parameters<typeof ledState>[0]>): GameState {
  return ledState({
    captains: [
      {
        ...makeCaptain('c1', 'p1', { x: 3, y: 4 }, [{ unitId: 'grunt', count: 2 }]),
        movementPoints: 0,
        skills: ['pirates-gunnery-1'],
        stats: { attack: 1, defense: 0, speed: 0 },
      },
      ...(extra?.captains ?? []),
    ],
    parties: [
      makeParty('lp1', 'p1', { x: 4, y: 4 }, [{ unitId: 'grunt', count: 4 }], 'c1'),
      ...(extra?.parties ?? []),
    ],
    ...(extra?.p2City !== undefined ? { p2City: extra.p2City } : {}),
    ...(extra?.garrison !== undefined ? { garrison: extra.garrison } : {}),
    ...(extra?.currentPlayerIndex !== undefined
      ? { currentPlayerIndex: extra.currentPlayerIndex }
      : {}),
  })
}

describe('an anchored, captainless ship (#498)', () => {
  it('takes no ship orders while its captain is ashore', () => {
    const state = ashoreState({ p2City: false })
    const acts: Action[] = [
      { type: 'moveCaptain', playerId: 'p1', captainId: 'c1', to: { x: 2, y: 4 } },
      { type: 'setSailOrder', playerId: 'p1', captainId: 'c1', destination: { x: 1, y: 1 } },
      { type: 'disembark', playerId: 'p1', captainId: 'c1', to: { x: 4, y: 5 }, troops: [{ unitId: 'grunt', count: 1 }] }, // prettier-ignore
    ]
    for (const action of acts) {
      expect(() => applyAction(state, action)).toThrow(/ashore leading/)
    }
  })

  it('stays at zero movement across refreshes while the captain is ashore', () => {
    let state = ashoreState({ p2City: false })
    state = applyAction(state, { type: 'endTurn', playerId: 'p1' })
    state = applyAction(state, { type: 'endTurn', playerId: 'p2' })
    expect(state.captains.find((c) => c.id === 'c1')!.movementPoints).toBe(0)
    // The party itself refreshes normally.
    expect(state.parties[0]!.movementPoints).toBe(GAME_SETUP.partyMovementPoints)
  })

  it('sheet actions still work ashore: the captain may spend a stat point', () => {
    const base = ashoreState({ p2City: false })
    const state: GameState = {
      ...base,
      captains: base.captains.map((c) => (c.id === 'c1' ? { ...c, xp: 400 } : c)),
    }
    const next = applyAction(state, {
      type: 'chooseCaptainStat',
      playerId: 'p1',
      captainId: 'c1',
      stat: 'defense',
    })
    expect(next.captains.find((c) => c.id === 'c1')!.stats.defense).toBe(1)
  })
})

describe('led-party combat (#498)', () => {
  it("partyToCombatant applies the leader's skill + stat bonuses", () => {
    const state = ashoreState({ p2City: false })
    const leader = state.captains.find((c) => c.id === 'c1')!
    const combatant = partyToCombatant(state.parties[0]!, leader, CATALOG)
    // The skill keeps its 10%; the attack point is a flat +1 per unit.
    expect(combatant.attackBonusPct).toBe(10)
    expect(combatant.attackFlatBonus).toBe(1)
    const unled = partyToCombatant(state.parties[0]!)
    expect(unled.attackBonusPct).toBeUndefined()
    expect(unled.attackFlatBonus).toBeUndefined()
  })

  it('a led party beating an enemy party banks combat XP for its leader', () => {
    const state = ashoreState({
      p2City: false,
      parties: [makeParty('lp2', 'p2', { x: 5, y: 4 }, [{ unitId: 'b1', count: 1 }])],
    })
    const next = applyAction(state, {
      type: 'attackParty',
      playerId: 'p1',
      partyId: 'lp1',
      targetPartyId: 'lp2',
    })
    expect(next.captains.find((c) => c.id === 'c1')!.xp).toBe(GAME_SETUP.combatWinXp)
    expect(next.parties.some((p) => p.id === 'lp2')).toBe(false)
  })

  it('a led party destroyed in a party battle gets its captain captured by the winner', () => {
    const state = ashoreState({
      p2City: false,
      // p1 keeps a spare captain far away so losing the party (and its leader)
      // does not eliminate the seat and sweep the captive off the board (#208).
      captains: [makeCaptain('spare1', 'p1', { x: 1, y: 1 })],
      parties: [makeParty('lp2', 'p2', { x: 5, y: 4 }, [{ unitId: 'brute', count: 30 }])],
      // p2 acts: its brute column crushes p1's led party.
      currentPlayerIndex: 1,
    })
    const next = applyAction(state, {
      type: 'attackParty',
      playerId: 'p2',
      partyId: 'lp2',
      targetPartyId: 'lp1',
    })
    expect(next.parties.some((p) => p.id === 'lp1')).toBe(false)
    const cap = next.captains.find((c) => c.id === 'c1')!
    expect(cap.captured).toBe(true)
    expect(cap.capturedBy).toBe('p2')
  })

  it('a led party losing a city assault gets its captain captured by the city owner', () => {
    const base = ashoreState({
      garrison: { b1: 40 },
      // A spare keeps p1 alive after the loss, so the captive stays visible.
      captains: [makeCaptain('spare1', 'p1', { x: 1, y: 1 })],
    })
    // March the column beside the city first (surgically, to skip the trek).
    const state: GameState = {
      ...base,
      parties: base.parties.map((p) => (p.id === 'lp1' ? { ...p, position: { x: 10, y: 5 } } : p)),
    }
    const next = applyAction(state, {
      type: 'partyAssaultCity',
      playerId: 'p1',
      partyId: 'lp1',
      targetCityId: 'p2-city',
    })
    expect(next.parties.some((p) => p.id === 'lp1')).toBe(false)
    const cap = next.captains.find((c) => c.id === 'c1')!
    expect(cap.captured).toBe(true)
    expect(cap.capturedBy).toBe('p2')
    expect(next.cities[0]!.ownerId).toBe('p2')
  })

  it('a led party taking a city banks combat XP for its leader', () => {
    const base = ashoreState({ garrison: {} })
    const state: GameState = {
      ...base,
      parties: base.parties.map((p) =>
        p.id === 'lp1'
          ? { ...p, position: { x: 10, y: 5 }, troops: [{ unitId: 'brute', count: 30 }] }
          : p,
      ),
    }
    const next = applyAction(state, {
      type: 'partyAssaultCity',
      playerId: 'p1',
      partyId: 'lp1',
      targetCityId: 'p2-city',
    })
    expect(next.cities[0]!.ownerId).toBe('p1')
    expect(next.captains.find((c) => c.id === 'c1')!.xp).toBe(GAME_SETUP.combatWinXp)
  })
})

describe('the anchored ship loses a naval defense (#498)', () => {
  const attackedState = () =>
    ashoreState({
      p2City: false,
      captains: [makeCaptain('c2', 'p2', { x: 3, y: 3 }, [{ unitId: 'brute', count: 12 }])],
      currentPlayerIndex: 1,
    })

  function sinkAnchored(state: GameState): GameState {
    return applyAction(state, {
      type: 'attackCaptain',
      playerId: 'p2',
      captainId: 'c2',
      targetCaptainId: 'c1',
    })
  }

  it('loses the ship (prize minted) but NOT the captain — the party is stranded, not headless', () => {
    const next = sinkAnchored(attackedState())
    const cap = next.captains.find((c) => c.id === 'c1')!
    expect(cap.captured).toBe(false)
    expect(cap.shipLost).toBe(true)
    expect(cap.position).toEqual({ x: 4, y: 4 }) // standing with its party
    expect(cap.troops).toEqual([])
    // The hull went to the victor as a prize, exactly like any decisive loss.
    expect(next.captains.some((c) => c.ownerId === 'p2' && c.id.startsWith('prize-'))).toBe(true)
    expect(next.parties[0]!.captainId).toBe('c1')
  })

  it('a shipless captain is not a naval target and cannot re-board a ship that is gone', () => {
    const next = sinkAnchored(attackedState())
    expect(() =>
      applyAction(next, {
        type: 'attackCaptain',
        playerId: 'p2',
        captainId: 'c2',
        targetCaptainId: 'c1',
      }),
    ).toThrow(/no ship to attack/)

    const p1Turn: GameState = { ...next, currentPlayerIndex: 0 }
    expect(() =>
      applyAction(p1Turn, { type: 'embark', playerId: 'p1', partyId: 'lp1', captainId: 'c1' }),
    ).toThrow(/nothing to re-board/)
  })

  it('the shipless captain follows its party as it marches, hidden from enemy views', () => {
    let next = sinkAnchored(attackedState())
    next = applyAction(next, { type: 'endTurn', playerId: 'p2' })
    next = applyAction(next, { type: 'moveParty', playerId: 'p1', partyId: 'lp1', to: { x: 6, y: 4 } }) // prettier-ignore
    const cap = next.captains.find((c) => c.id === 'c1')!
    expect(cap.position).toEqual({ x: 6, y: 4 })

    // p2's view: the party is visible (adjacent-ish), the shipless captain is not.
    const enemyView = playerView(next, 'p2')
    expect(enemyView.captains.some((c) => c.id === 'c1')).toBe(false)
    // Own view keeps the sheet, flagged.
    const ownView = playerView(next, 'p1')
    expect(ownView.captains.find((c) => c.id === 'c1')!.shipLost).toBe(true)
  })
})

describe('embark reunites (#498)', () => {
  it('re-boarding the own ship restores control; a partial reunite leaves the remainder unled', () => {
    // Cap the hold: ship already carries 10 of 12, party of 4 → only 2 fit.
    const base = ashoreState({ p2City: false })
    const state: GameState = {
      ...base,
      captains: base.captains.map((c) =>
        c.id === 'c1' ? { ...c, troops: [{ unitId: 'grunt', count: 10 }] } : c,
      ),
    }
    const next = applyAction(state, {
      type: 'embark',
      playerId: 'p1',
      partyId: 'lp1',
      captainId: 'c1',
    })
    expect(next.captains.find((c) => c.id === 'c1')!.troops).toEqual([
      { unitId: 'grunt', count: 12 },
    ])
    const remainder = next.parties.find((p) => p.id === 'lp1')!
    expect(remainder.troops).toEqual([{ unitId: 'grunt', count: 2 }])
    expect(remainder.captainId).toBeUndefined()

    // Control restored: the ship refreshes and sails again next turn.
    let sailing = applyAction(next, { type: 'endTurn', playerId: 'p1' })
    sailing = applyAction(sailing, { type: 'endTurn', playerId: 'p2' })
    expect(sailing.captains.find((c) => c.id === 'c1')!.movementPoints).toBe(
      GAME_SETUP.startingCaptainMovement,
    )
  })

  it('a full reunite removes the party and clears the led state', () => {
    const next = applyAction(ashoreState({ p2City: false }), {
      type: 'embark',
      playerId: 'p1',
      partyId: 'lp1',
      captainId: 'c1',
    })
    expect(next.parties).toEqual([])
    expect(next.captains.find((c) => c.id === 'c1')!.troops).toEqual([
      { unitId: 'grunt', count: 6 },
    ])
  })

  it("a led party never boards another captain's ship", () => {
    const state = ashoreState({
      p2City: false,
      captains: [makeCaptain('c3', 'p1', { x: 4, y: 3 })],
    })
    expect(() =>
      applyAction(state, { type: 'embark', playerId: 'p1', partyId: 'lp1', captainId: 'c3' }),
    ).toThrow(/only re-board/)
  })
})

describe('led parties: fog and replay (#498)', () => {
  it('disclosed the led state to the owner only', () => {
    const state = ashoreState({
      p2City: false,
      captains: [makeCaptain('c2', 'p2', { x: 3, y: 3 })],
    })
    const own = playerView(state, 'p1').parties.find((p) => p.id === 'lp1')!
    expect(own.captainId).toBe('c1')
    const enemy = playerView(state, 'p2').parties.find((p) => p.id === 'lp1')
    // In vision (c2 sits two tiles off), but the led state is manifest detail.
    expect(enemy).toBeDefined()
    expect(enemy!.captainId).toBeUndefined()
  })

  it('replays a lead-fight-reunite log to an identical state', () => {
    const base = ledState({
      captains: [
        makeCaptain('c1', 'p1', { x: 3, y: 4 }, [{ unitId: 'grunt', count: 6 }]),
        // p2 keeps a far ship so losing its party doesn't end the match mid-log.
        makeCaptain('c2', 'p2', { x: 1, y: 10 }),
      ],
      parties: [makeParty('lp2', 'p2', { x: 5, y: 4 }, [{ unitId: 'b1', count: 1 }])],
      p2City: false,
    })
    const log: Action[] = [
      {
        type: 'disembark',
        playerId: 'p1',
        captainId: 'c1',
        to: { x: 4, y: 4 },
        troops: [{ unitId: 'grunt', count: 4 }],
        withCaptain: true,
      },
      { type: 'endTurn', playerId: 'p1' },
      { type: 'endTurn', playerId: 'p2' },
      { type: 'attackParty', playerId: 'p1', partyId: 'party-0', targetPartyId: 'lp2' },
      { type: 'embark', playerId: 'p1', partyId: 'party-0', captainId: 'c1' },
    ]
    const a = replay(base, log)
    const b = replay(base, log)
    expect(JSON.stringify(a)).toBe(JSON.stringify(b))
    const cap = a.captains.find((c) => c.id === 'c1')!
    expect(cap.xp).toBe(GAME_SETUP.combatWinXp)
    expect(a.parties).toEqual([])
    expect(a.actionCount).toBe(log.length)
  })

  it('battle reports flow through applyActionWithOutcome for led battles unchanged', () => {
    const state = ashoreState({
      p2City: false,
      parties: [makeParty('lp2', 'p2', { x: 5, y: 4 }, [{ unitId: 'b1', count: 1 }])],
    })
    const { battleReport } = applyActionWithOutcome(state, {
      type: 'attackParty',
      playerId: 'p1',
      partyId: 'lp1',
      targetPartyId: 'lp2',
    })
    expect(battleReport).toBeDefined()
    expect(battleReport!.winnerId).toBe('p1')
  })
})

/**
 * Stranded-captain rescue (#499, operator decision 2026-07-14 "instant pool
 * transfer"): a ship-lost captain's party may embark onto ANY own adjacent
 * ship, and a ship-lost leader whose party stands at an owned city is rescued
 * on the spot. Either way the captain transfers instantly to the owner's
 * recruitment pool — still `shipLost`, leading nothing (see
 * captainAwaitingCommand) — and `recruitCaptain` re-commissions it onto a
 * fresh hull at the normal fee, with no captivity wait.
 */

/** Give p1 an owned tavern city at the (11,5) port, and gold to hire with. */
function withHomePort(state: GameState, gold = 1000): GameState {
  return {
    ...state,
    cities: [
      ...state.cities,
      {
        id: 'p1-port',
        ownerId: 'p1',
        name: 'Refuge',
        position: { x: 11, y: 5 },
        buildings: ['tavern'],
        builtThisRound: false,
        garrison: {},
        unitAvailability: {},
      },
    ],
    players: state.players.map((p) =>
      p.id === 'p1' ? { ...p, resources: { ...p.resources, gold } } : p,
    ),
  }
}

describe('stranded-captain rescue (#499)', () => {
  /** ashoreState plus p2's raider beside the anchored ship and p1's spare ship beside the party. */
  const rescueBase = () =>
    ashoreState({
      p2City: false,
      captains: [
        makeCaptain('c2', 'p2', { x: 3, y: 3 }, [{ unitId: 'brute', count: 12 }]),
        makeCaptain('c9', 'p1', { x: 4, y: 3 }),
      ],
      currentPlayerIndex: 1,
    })

  function sinkAnchored(state: GameState): GameState {
    return applyAction(state, {
      type: 'attackCaptain',
      playerId: 'p2',
      captainId: 'c2',
      targetCaptainId: 'c1',
    })
  }

  /** c1 already stranded (ship lost) leading lp1 at `at` — skips the naval defeat. */
  function strandedState(
    at: { x: number; y: number },
    extra?: Partial<Parameters<typeof ledState>[0]>,
  ): GameState {
    return ledState({
      captains: [
        {
          ...makeCaptain('c1', 'p1', at),
          shipLost: true,
          movementPoints: 0,
          skills: ['pirates-gunnery-1'],
        },
        ...(extra?.captains ?? []),
      ],
      parties: [
        makeParty('lp1', 'p1', at, [{ unitId: 'brute', count: 30 }], 'c1'),
        ...(extra?.parties ?? []),
      ],
      ...(extra?.p2City !== undefined ? { p2City: extra.p2City } : {}),
      ...(extra?.garrison !== undefined ? { garrison: extra.garrison } : {}),
    })
  }

  it('a ship-lost leader’s party embarks onto ANY own ship; the captain pools instantly', () => {
    let s = sinkAnchored(rescueBase())
    s = applyAction(s, { type: 'endTurn', playerId: 'p2' })
    s = applyAction(s, { type: 'embark', playerId: 'p1', partyId: 'lp1', captainId: 'c9' })

    // The full column boards the spare ship; the party leaves the map.
    expect(s.parties).toEqual([])
    expect(s.captains.find((c) => c.id === 'c9')!.troops).toEqual([{ unitId: 'grunt', count: 4 }])

    // The rescued captain is pooled: still ship-lost, leading nothing, not captured.
    const c1 = s.captains.find((c) => c.id === 'c1')!
    expect(c1.captured).toBe(false)
    expect(c1.shipLost).toBe(true)
    expect(captainAwaitingCommand(c1, s.parties)).toBe(true)
    // Pooled captains stay off enemy views, like any ship-lost captain.
    expect(playerView(s, 'p2').captains.some((c) => c.id === 'c1')).toBe(false)
  })

  it('a partial rescue boards what fits; the remainder stays ashore unled', () => {
    let s = sinkAnchored(rescueBase())
    s = applyAction(s, { type: 'endTurn', playerId: 'p2' })
    // Cap the hold: 10 of 12 berths taken, party of 4 → only 2 fit.
    s = {
      ...s,
      captains: s.captains.map((c) =>
        c.id === 'c9' ? { ...c, troops: [{ unitId: 'grunt', count: 10 }] } : c,
      ),
    }
    s = applyAction(s, { type: 'embark', playerId: 'p1', partyId: 'lp1', captainId: 'c9' })
    const remainder = s.parties.find((p) => p.id === 'lp1')!
    expect(remainder.troops).toEqual([{ unitId: 'grunt', count: 2 }])
    expect(remainder.captainId).toBeUndefined()
    // The captain boards with whoever fits — pooled all the same.
    expect(
      captainAwaitingCommand(
        s.captains.find((c) => c.id === 'c1')!,
        s.parties,
      ),
    ).toBe(true)
  })

  it('no party ever embarks ONTO a ship-lost captain — there is no hull to board', () => {
    let s = sinkAnchored(rescueBase())
    s = applyAction(s, { type: 'endTurn', playerId: 'p2' })
    // An unled second party beside the stranded leader.
    s = {
      ...s,
      parties: [...s.parties, makeParty('lp3', 'p1', { x: 4, y: 5 }, [{ unitId: 'grunt', count: 1 }])], // prettier-ignore
    }
    expect(() =>
      applyAction(s, { type: 'embark', playerId: 'p1', partyId: 'lp3', captainId: 'c1' }),
    ).toThrow(/nothing to re-board/)
  })

  it('recruitCaptain re-commissions a pooled rescue at once: new hull, sheet kept, fee paid', () => {
    let s = withHomePort(sinkAnchored(rescueBase()))
    s = applyAction(s, { type: 'endTurn', playerId: 'p2' })
    s = applyAction(s, { type: 'embark', playerId: 'p1', partyId: 'lp1', captainId: 'c9' })
    s = applyAction(s, {
      type: 'recruitCaptain',
      playerId: 'p1',
      cityId: 'p1-port',
      captainId: 'c1',
    })

    const c1 = s.captains.find((c) => c.id === 'c1')!
    expect(c1.shipLost).toBeUndefined()
    expect(c1.captured).toBe(false)
    // Back to sea on the starter hull beside the port, refits gone, sheet kept.
    expect(c1.shipClassId).toBe(GAME_SETUP.startingShipClass)
    expect(c1.shipUpgrades).toEqual({})
    expect(c1.skills).toEqual(['pirates-gunnery-1'])
    expect(c1.stats).toEqual({ attack: 1, defense: 0, speed: 0 })
    expect(c1.troops).toEqual([{ unitId: 'grunt', count: GAME_SETUP.recruitCaptainStartingCrew }])
    expect(islandMap().tiles[c1.position.y * 16 + c1.position.x]!.type).toBe('deep')
    // Fee: the pooled rescue is not a fielded captain, so only c9 scales the price.
    const fee = Math.ceil(GAME_SETUP.recruitCaptainBaseCost * GAME_SETUP.recruitCaptainCostGrowth)
    expect(s.players[0]!.resources.gold).toBe(1000 - fee)
  })

  it('a still-leading ship-lost captain is NOT in the pool — no re-flag by mail order', () => {
    const s = withHomePort(strandedState({ x: 6, y: 5 }, { p2City: false }))
    expect(() =>
      applyAction(s, {
        type: 'recruitCaptain',
        playerId: 'p1',
        cityId: 'p1-port',
        captainId: 'c1',
      }),
    ).toThrow(/not in the recruitment pool/)
  })

  it('marching the stranded column to an owned city rescues the leader on the spot', () => {
    let s = withHomePort(strandedState({ x: 9, y: 5 }, { p2City: false }))
    s = applyAction(s, { type: 'moveParty', playerId: 'p1', partyId: 'lp1', to: { x: 10, y: 5 } })
    const lp1 = s.parties.find((p) => p.id === 'lp1')!
    expect(lp1.captainId).toBeUndefined()
    const c1 = s.captains.find((c) => c.id === 'c1')!
    expect(c1.position).toEqual({ x: 10, y: 5 })
    expect(captainAwaitingCommand(c1, s.parties)).toBe(true)
  })

  it('taking a city with the stranded column rescues the leader too (and banks the XP)', () => {
    const s0 = strandedState(
      { x: 10, y: 5 },
      { garrison: {}, captains: [makeCaptain('c2', 'p2', { x: 1, y: 10 })] },
    )
    const s = applyAction(s0, {
      type: 'partyAssaultCity',
      playerId: 'p1',
      partyId: 'lp1',
      targetCityId: 'p2-city',
    })
    expect(s.cities[0]!.ownerId).toBe('p1')
    expect(s.parties.find((p) => p.id === 'lp1')!.captainId).toBeUndefined()
    const c1 = s.captains.find((c) => c.id === 'c1')!
    expect(c1.xp).toBe(GAME_SETUP.combatWinXp)
    expect(captainAwaitingCommand(c1, s.parties)).toBe(true)
  })

  it('chained edge (#499 audit): ship lost, THEN the party destroyed — a plain captive, flag down', () => {
    const s0 = ashoreState({
      p2City: false,
      captains: [
        makeCaptain('c2', 'p2', { x: 3, y: 3 }, [{ unitId: 'brute', count: 12 }]),
        // A spare keeps p1 alive after the loss, so the captive stays visible.
        makeCaptain('spare1', 'p1', { x: 1, y: 1 }),
      ],
      parties: [makeParty('lp2', 'p2', { x: 5, y: 4 }, [{ unitId: 'brute', count: 30 }])],
      currentPlayerIndex: 1,
    })
    let s = sinkAnchored(s0)
    expect(s.captains.find((c) => c.id === 'c1')!.shipLost).toBe(true)
    s = applyAction(s, { type: 'attackParty', playerId: 'p2', partyId: 'lp2', targetPartyId: 'lp1' }) // prettier-ignore
    const c1 = s.captains.find((c) => c.id === 'c1')!
    expect(c1.captured).toBe(true)
    expect(c1.capturedBy).toBe('p2')
    expect(c1.shipLost).toBeUndefined()
  })

  it('a seat left with nothing but pooled captains is eliminated', () => {
    let s = sinkAnchored(rescueBase())
    s = applyAction(s, { type: 'endTurn', playerId: 'p2' })
    s = applyAction(s, { type: 'embark', playerId: 'p1', partyId: 'lp1', captainId: 'c9' })
    s = applyAction(s, { type: 'endTurn', playerId: 'p1' })
    // p2 sinks the rescue ship: p1 is down to the pooled c1 — a hire-in-waiting
    // with no port to hire at is no seat at all.
    s = applyAction(s, { type: 'attackCaptain', playerId: 'p2', captainId: 'c2', targetCaptainId: 'c9' }) // prettier-ignore
    expect(s.players[0]!.eliminated).toBe(true)
    expect(s.status).toBe('finished')
    expect(s.winnerId).toBe('p2')
  })

  it('replays a strand-rescue-recommission log to an identical state', () => {
    const base = withHomePort(rescueBase())
    const log: Action[] = [
      { type: 'attackCaptain', playerId: 'p2', captainId: 'c2', targetCaptainId: 'c1' },
      { type: 'endTurn', playerId: 'p2' },
      { type: 'embark', playerId: 'p1', partyId: 'lp1', captainId: 'c9' },
      { type: 'recruitCaptain', playerId: 'p1', cityId: 'p1-port', captainId: 'c1' },
    ]
    const a = replay(base, log)
    const b = replay(base, log)
    expect(JSON.stringify(a)).toBe(JSON.stringify(b))
    const c1 = a.captains.find((c) => c.id === 'c1')!
    expect(c1.shipLost).toBeUndefined()
    expect(a.actionCount).toBe(log.length)
  })
})
