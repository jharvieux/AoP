import { describe, expect, it } from 'vitest'
import { chebyshevDistance, coordsEqual, type Coord } from '@aop/shared'
import {
  applyAction,
  captainsOf,
  createGame,
  currentlyVisibleTiles,
  currentPlayer,
  findPath,
  generateMap,
  InvalidActionError,
  isWaterTile,
  pathCost,
  replay,
  tileAt,
  tileKey,
  tilesInRadius,
  type Action,
  type ContentCatalog,
  type GameConfig,
  type GameMap,
  type GameState,
  type MapDefinition,
  type Tile,
} from '../src'
import { GAME_SETUP } from './fixtures'

/**
 * Minimal content catalog so recruitCaptain can assign a faction-appropriate
 * crew. Includes a tavern (#433) so the recruitCaptain-gate tests below can
 * grant/withhold it explicitly via {@link withBuilding}.
 */
const CAPTAIN_CATALOG: ContentCatalog = {
  buildings: {
    tavern: { produces: {}, cost: {}, unlocksCaptains: true },
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
    sloop: { hull: 40, cannons: 6, speed: 5, crewCapacity: 8, upgrades: {} },
  },
  skills: {},
  captainXpThresholds: [0, 100, 250],
}

const STARTING_CAPTAIN_MOVEMENT = GAME_SETUP.startingCaptainMovement

function testConfig(playerCount = 3): GameConfig {
  const factions = ['pirates', 'british', 'spanish', 'dutch'] as const
  return {
    seed: 42,
    mapSize: 'medium',
    setup: GAME_SETUP,
    players: Array.from({ length: playerCount }, (_, i) => ({
      id: `p${i + 1}`,
      name: `Player ${i + 1}`,
      faction: factions[i % factions.length]!,
      isAI: i > 0,
    })),
  }
}

/** Find a reachable water tile a given number of steps from a captain's start. */
function reachableTarget(state: GameState, from: Coord, maxCost: number): Coord {
  const { map } = state
  for (let radius = 1; radius <= maxCost; radius++) {
    for (let y = 0; y < map.height; y++) {
      for (let x = 0; x < map.width; x++) {
        const to = { x, y }
        if (coordsEqual(to, from) || !isWaterTile(tileAt(map, to))) continue
        const cost = pathCost(map, from, to)
        if (cost !== null && cost > 0 && cost <= maxCost) return to
      }
    }
  }
  throw new Error('no reachable target found')
}

describe('captains at game start', () => {
  it('spawns one captain per player on its start tile', () => {
    const state = createGame(testConfig(4))
    expect(state.captains).toHaveLength(4)
    state.players.forEach((p, i) => {
      const caps = captainsOf(state, p.id)
      expect(caps).toHaveLength(1)
      expect(coordsEqual(caps[0]!.position, state.map.startPositions[i]!)).toBe(true)
      expect(caps[0]!.movementPoints).toBe(STARTING_CAPTAIN_MOVEMENT)
    })
  })

  it('carries the configured starting troops', () => {
    const config = testConfig(2)
    config.players[0]!.startingTroops = [{ unitId: 'deckhand', count: 3 }]
    const state = createGame(config)
    expect(captainsOf(state, 'p1')[0]!.troops).toEqual([{ unitId: 'deckhand', count: 3 }])
    expect(captainsOf(state, 'p2')[0]!.troops).toEqual([])
  })
})

describe('naval pathfinding', () => {
  it('is deterministic for identical queries', () => {
    const { map } = createGame(testConfig(4))
    const from = map.startPositions[0]!
    const to = map.startPositions[1]!
    expect(findPath(map, from, to)).toEqual(findPath(map, from, to))
  })

  it('returns a contiguous water-only path between endpoints', () => {
    const { map } = createGame(testConfig(4))
    const path = findPath(map, map.startPositions[0]!, map.startPositions[2]!)
    expect(path).not.toBeNull()
    const p = path!
    expect(coordsEqual(p[0]!, map.startPositions[0]!)).toBe(true)
    expect(coordsEqual(p[p.length - 1]!, map.startPositions[2]!)).toBe(true)
    for (let i = 0; i < p.length; i++) {
      expect(isWaterTile(tileAt(map, p[i]!))).toBe(true)
      if (i > 0) expect(chebyshevDistance(p[i - 1]!, p[i]!)).toBe(1)
    }
  })

  it('refuses to path onto land', () => {
    const { map } = createGame(testConfig(4))
    const land = map.tiles.findIndex((t) => t.type === 'land')
    const landCoord = { x: land % map.width, y: Math.floor(land / map.width) }
    expect(findPath(map, map.startPositions[0]!, landCoord)).toBeNull()
  })

  it('finds the exact same shortest path across repeated queries on the same map (#214)', () => {
    // Pins the binary-heap implementation's output to a fixed, hand-checked route so
    // a future change to the heap's tie-break can't silently reorder ties (f, then h,
    // then tile index) without a test catching it.
    const map = generateMap(
      42,
      'medium',
      4,
      GAME_SETUP.homeIslandRadius,
      GAME_SETUP.homeIslandRingRadiusFactor,
    )
    const from = map.startPositions[0]!
    const to = map.startPositions[1]!
    const path = findPath(map, from, to)
    expect(path).not.toBeNull()
    expect(path).toEqual(findPath(map, from, to))
    expect(pathCost(map, from, to)).toBe(path!.length - 1)
  })

  it('returns null immediately for tiles in disconnected sea basins', () => {
    // A hand-built map: two 3x3 water pools separated by an unbroken land wall, so a
    // query between them must fail via the cached water-component check (#214)
    // rather than by exhausting a full-map flood.
    const width = 9
    const height = 3
    const tiles: GameMap['tiles'] = Array.from({ length: width * height }, (_, i) => {
      const x = i % width
      return x === 4 ? { type: 'land', island: 0 } : { type: 'deep', island: -1 }
    })
    const map: GameMap = { width, height, tiles, startPositions: [] }

    const left = { x: 1, y: 1 }
    const right = { x: 7, y: 1 }
    expect(isWaterTile(tileAt(map, left))).toBe(true)
    expect(isWaterTile(tileAt(map, right))).toBe(true)
    expect(findPath(map, left, right)).toBeNull()

    // Within one basin, pathing still works normally.
    const other = { x: 2, y: 1 }
    expect(findPath(map, left, other)).not.toBeNull()
  })

  it('scales well past a naive O(n) open-list scan on a large map (#214 perf regression)', () => {
    // Not a precise benchmark (CI hardware varies), just a generous ceiling that a
    // reintroduced linear open-list scan or whole-ocean flood would blow through:
    // ~1600 tiles, 8 corner-to-corner-ish queries, repeated 25x.
    const map = generateMap(
      7,
      'large',
      8,
      GAME_SETUP.homeIslandRadius,
      GAME_SETUP.homeIslandRingRadiusFactor,
    )
    const starts = map.startPositions

    const startedAt = Date.now()
    for (let iter = 0; iter < 25; iter++) {
      for (let i = 0; i < starts.length; i++) {
        for (let j = 0; j < starts.length; j++) {
          if (i === j) continue
          findPath(map, starts[i]!, starts[j]!)
        }
      }
    }
    const elapsedMs = Date.now() - startedAt
    expect(elapsedMs).toBeLessThan(2000)
  })
})

describe('moveCaptain action', () => {
  it('moves the captain and deducts movement points', () => {
    const state = createGame(testConfig(3))
    const cap = captainsOf(state, 'p1')[0]!
    const to = reachableTarget(state, cap.position, 3)
    const cost = pathCost(state.map, cap.position, to)!

    const next = applyAction(state, {
      type: 'moveCaptain',
      playerId: 'p1',
      captainId: cap.id,
      to,
    })
    const moved = next.captains.find((c) => c.id === cap.id)!
    expect(coordsEqual(moved.position, to)).toBe(true)
    expect(moved.movementPoints).toBe(STARTING_CAPTAIN_MOVEMENT - cost)
  })

  it("rejects moving another player's captain", () => {
    const state = createGame(testConfig(3))
    const enemyCap = captainsOf(state, 'p2')[0]!
    expect(() =>
      applyAction(state, {
        type: 'moveCaptain',
        playerId: 'p1',
        captainId: enemyCap.id,
        to: enemyCap.position,
      }),
    ).toThrow(InvalidActionError)
  })

  it('rejects moves beyond available movement points', () => {
    const state = createGame(testConfig(3))
    const cap = captainsOf(state, 'p1')[0]!
    // A far enemy start is guaranteed to exceed one turn of movement.
    const far = createGame(testConfig(3)).map.startPositions[1]!
    expect(() =>
      applyAction(state, { type: 'moveCaptain', playerId: 'p1', captainId: cap.id, to: far }),
    ).toThrow(InvalidActionError)
  })

  it('replays a log with captain moves to an identical state', () => {
    const base = createGame(testConfig(2))
    const cap1 = captainsOf(base, 'p1')[0]!
    const cap2 = captainsOf(base, 'p2')[0]!
    const log: Action[] = [
      {
        type: 'moveCaptain',
        playerId: 'p1',
        captainId: cap1.id,
        to: reachableTarget(base, cap1.position, 2),
      },
      { type: 'endTurn', playerId: 'p1' },
      {
        type: 'moveCaptain',
        playerId: 'p2',
        captainId: cap2.id,
        to: reachableTarget(base, cap2.position, 2),
      },
      { type: 'endTurn', playerId: 'p2' },
    ]
    const a = replay(createGame(testConfig(2)), log)
    const b = replay(createGame(testConfig(2)), log)
    expect(JSON.stringify(a)).toBe(JSON.stringify(b))
    expect(a.actionCount).toBe(log.length)
  })

  it('refreshes movement points at the start of each turn', () => {
    let state = createGame(testConfig(2))
    const cap = captainsOf(state, 'p1')[0]!
    const to = reachableTarget(state, cap.position, 2)
    state = applyAction(state, { type: 'moveCaptain', playerId: 'p1', captainId: cap.id, to })
    expect(captainsOf(state, 'p1')[0]!.movementPoints).toBeLessThan(STARTING_CAPTAIN_MOVEMENT)

    state = applyAction(state, { type: 'endTurn', playerId: 'p1' })
    state = applyAction(state, { type: 'endTurn', playerId: 'p2' })
    expect(currentPlayer(state).id).toBe('p1')
    expect(captainsOf(state, 'p1')[0]!.movementPoints).toBe(STARTING_CAPTAIN_MOVEMENT)
  })
})

/** Directly adds a building to a city without going through construct — cheaper setup for reducer-level tests. */
function withBuilding(state: GameState, cityId: string, buildingId: string): GameState {
  return {
    ...state,
    cities: state.cities.map((c) =>
      c.id === cityId ? { ...c, buildings: [...c.buildings, buildingId] } : c,
    ),
  }
}

/** Directly marks a captain captive (#309) without going through combat — cheaper setup for reducer-level tests. */
function withCapturedCaptain(
  state: GameState,
  captainId: string,
  capturedBy: string,
  roundsFromNow: number,
): GameState {
  return {
    ...state,
    captains: state.captains.map((c) =>
      c.id === captainId
        ? {
            ...c,
            captured: true,
            capturedBy,
            troops: [],
            movementPoints: 0,
            maxMovementPoints: 0,
            captivityReturnRound: state.round + roundsFromNow,
          }
        : c,
    ),
  }
}

describe('recruitCaptain action (#308/#309)', () => {
  it('mints a brand-new captain at an owned port for the scaled gold cost', () => {
    const state = withBuilding(
      createGame({ ...testConfig(2), content: CAPTAIN_CATALOG }),
      'p1-capital',
      'tavern',
    )
    const goldBefore = state.players.find((p) => p.id === 'p1')!.resources.gold
    const cost = Math.ceil(
      GAME_SETUP.recruitCaptainBaseCost * GAME_SETUP.recruitCaptainCostGrowth ** 1,
    )
    const next = applyAction(state, {
      type: 'recruitCaptain',
      playerId: 'p1',
      cityId: 'p1-capital',
    })
    expect(captainsOf(next, 'p1')).toHaveLength(2)
    const original = captainsOf(state, 'p1')[0]!.id
    const minted = captainsOf(next, 'p1').find((c) => c.id !== original)!
    expect(minted.captured).toBe(false)
    expect(minted.shipClassId).toBe(GAME_SETUP.startingShipClass)
    expect(minted.troops).toEqual([
      { unitId: 'deckhand', count: GAME_SETUP.recruitCaptainStartingCrew },
    ])
    expect(next.players.find((p) => p.id === 'p1')!.resources.gold).toBe(goldBefore - cost)
  })

  it('scales the cost up with each additional live captain (#309)', () => {
    let state = withBuilding(
      createGame({
        ...testConfig(2),
        content: CAPTAIN_CATALOG,
        setup: { ...GAME_SETUP, startingGold: 5000 },
      }),
      'p1-capital',
      'tavern',
    )
    state = applyAction(state, { type: 'recruitCaptain', playerId: 'p1', cityId: 'p1-capital' })
    const goldAfterFirst = state.players.find((p) => p.id === 'p1')!.resources.gold
    state = applyAction(state, { type: 'recruitCaptain', playerId: 'p1', cityId: 'p1-capital' })
    const secondCost = Math.ceil(
      GAME_SETUP.recruitCaptainBaseCost * GAME_SETUP.recruitCaptainCostGrowth ** 2,
    )
    expect(state.players.find((p) => p.id === 'p1')!.resources.gold).toBe(
      goldAfterFirst - secondCost,
    )
    expect(captainsOf(state, 'p1')).toHaveLength(3)
  })

  it('rejects recruiting a captain without enough gold', () => {
    const state = withBuilding(
      createGame({
        ...testConfig(2),
        content: CAPTAIN_CATALOG,
        setup: { ...GAME_SETUP, startingGold: 10 },
      }),
      'p1-capital',
      'tavern',
    )
    expect(() =>
      applyAction(state, { type: 'recruitCaptain', playerId: 'p1', cityId: 'p1-capital' }),
    ).toThrow(InvalidActionError)
  })

  it('rejects recruiting at a city you do not own', () => {
    const state = createGame({ ...testConfig(2), content: CAPTAIN_CATALOG })
    expect(() =>
      applyAction(state, { type: 'recruitCaptain', playerId: 'p1', cityId: 'p2-capital' }),
    ).toThrow(InvalidActionError)
  })

  it('rejects recruiting a captain without a tavern (#433)', () => {
    const state = createGame({ ...testConfig(2), content: CAPTAIN_CATALOG })
    expect(() =>
      applyAction(state, { type: 'recruitCaptain', playerId: 'p1', cityId: 'p1-capital' }),
    ).toThrow(InvalidActionError)
  })

  it('allows recruiting a captain once the city has a tavern (#433)', () => {
    const state = withBuilding(
      createGame({ ...testConfig(2), content: CAPTAIN_CATALOG }),
      'p1-capital',
      'tavern',
    )
    const next = applyAction(state, {
      type: 'recruitCaptain',
      playerId: 'p1',
      cityId: 'p1-capital',
    })
    expect(captainsOf(next, 'p1')).toHaveLength(2)
  })

  it('rejects rehiring an eligible captive without a tavern (#433) — rehire goes through the same gate as a fresh recruit', () => {
    const base = createGame({ ...testConfig(2), content: CAPTAIN_CATALOG })
    const p1cap = captainsOf(base, 'p1')[0]!
    const state = withCapturedCaptain(base, p1cap.id, 'p2', 0)
    expect(() =>
      applyAction(state, {
        type: 'recruitCaptain',
        playerId: 'p1',
        cityId: 'p1-capital',
        captainId: p1cap.id,
      }),
    ).toThrow(InvalidActionError)
  })

  it('rejects rehiring a captive before its captivity round arrives', () => {
    const base = withBuilding(
      createGame({ ...testConfig(2), content: CAPTAIN_CATALOG }),
      'p1-capital',
      'tavern',
    )
    const p1cap = captainsOf(base, 'p1')[0]!
    const state = withCapturedCaptain(base, p1cap.id, 'p2', 3)
    expect(() =>
      applyAction(state, {
        type: 'recruitCaptain',
        playerId: 'p1',
        cityId: 'p1-capital',
        captainId: p1cap.id,
      }),
    ).toThrow(InvalidActionError)
  })

  it('rehires an eligible captive, preserving its identity, xp, and skills', () => {
    const base = withBuilding(
      createGame({ ...testConfig(2), content: CAPTAIN_CATALOG }),
      'p1-capital',
      'tavern',
    )
    const p1cap = captainsOf(base, 'p1')[0]!
    const withHistory: GameState = {
      ...base,
      captains: base.captains.map((c) => (c.id === p1cap.id ? { ...c, xp: 55, skills: ['x'] } : c)),
    }
    // 0 rounds from now: captivityReturnRound === the current round, so it's
    // eligible immediately (ransomCaptain achieves the same by pulling the
    // round forward — see the ransom tests below).
    const state = withCapturedCaptain(withHistory, p1cap.id, 'p2', 0)
    const next = applyAction(state, {
      type: 'recruitCaptain',
      playerId: 'p1',
      cityId: 'p1-capital',
      captainId: p1cap.id,
    })
    const revived = next.captains.find((c) => c.id === p1cap.id)!
    expect(revived.captured).toBe(false)
    expect(revived.capturedBy).toBeUndefined()
    expect(revived.captivityReturnRound).toBeUndefined()
    expect(revived.xp).toBe(55)
    expect(revived.skills).toEqual(['x'])
    expect(revived.troops).toEqual([
      { unitId: 'deckhand', count: GAME_SETUP.recruitCaptainStartingCrew },
    ])
    expect(captainsOf(next, 'p1')).toHaveLength(1)
  })

  it('returns a rehired captive on a starter hull with upgrades cleared (#374)', () => {
    // The captive's own ship was handed to its captor as a prize the moment it
    // was captured, so on release it comes back on the starter hull, upgrades
    // wiped — never the veteran hull it lost.
    const base = withBuilding(
      createGame({ ...testConfig(2), content: CAPTAIN_CATALOG }),
      'p1-capital',
      'tavern',
    )
    const p1cap = captainsOf(base, 'p1')[0]!
    const upgraded: GameState = {
      ...base,
      captains: base.captains.map((c) =>
        c.id === p1cap.id ? { ...c, shipClassId: 'galleon', shipUpgrades: { hull: 3 } } : c,
      ),
    }
    const state = withCapturedCaptain(upgraded, p1cap.id, 'p2', 0)
    const next = applyAction(state, {
      type: 'recruitCaptain',
      playerId: 'p1',
      cityId: 'p1-capital',
      captainId: p1cap.id,
    })
    const revived = next.captains.find((c) => c.id === p1cap.id)!
    // Falls back to startingShipClass when ransomReturnShipClassId is unset.
    expect(revived.shipClassId).toBe(GAME_SETUP.startingShipClass)
    expect(revived.shipUpgrades).toEqual({})
  })

  it('honors an explicit ransomReturnShipClassId for the returning hull (#374)', () => {
    const setup = { ...GAME_SETUP, ransomReturnShipClassId: 'brigantine' }
    const base = withBuilding(
      createGame({ ...testConfig(2), content: CAPTAIN_CATALOG, setup }),
      'p1-capital',
      'tavern',
    )
    const p1cap = captainsOf(base, 'p1')[0]!
    const state = withCapturedCaptain(base, p1cap.id, 'p2', 0)
    const next = applyAction(state, {
      type: 'recruitCaptain',
      playerId: 'p1',
      cityId: 'p1-capital',
      captainId: p1cap.id,
    })
    expect(next.captains.find((c) => c.id === p1cap.id)!.shipClassId).toBe('brigantine')
  })

  it('replays a recruitCaptain log to an identical state', () => {
    const base = withBuilding(
      createGame({ ...testConfig(2), content: CAPTAIN_CATALOG }),
      'p1-capital',
      'tavern',
    )
    const log: Action[] = [{ type: 'recruitCaptain', playerId: 'p1', cityId: 'p1-capital' }]
    const a = replay(base, log)
    const b = replay(base, log)
    expect(JSON.stringify(a)).toBe(JSON.stringify(b))
    expect(a.actionCount).toBe(log.length)
  })
})

describe('captured captains (#309)', () => {
  it('cannot move or take orders while captured', () => {
    const base = createGame(testConfig(2))
    const p1cap = captainsOf(base, 'p1')[0]!
    const state = withCapturedCaptain(base, p1cap.id, 'p2', 3)
    expect(() =>
      applyAction(state, {
        type: 'moveCaptain',
        playerId: 'p1',
        captainId: p1cap.id,
        to: p1cap.position,
      }),
    ).toThrow(InvalidActionError)
    expect(() =>
      applyAction(state, {
        type: 'setStandingOrders',
        playerId: 'p1',
        captainId: p1cap.id,
        orders: [],
      }),
    ).toThrow(InvalidActionError)
  })

  it("releases a captor's captives immediately when the captor resigns", () => {
    const base = createGame(testConfig(3))
    const p1cap = captainsOf(base, 'p1')[0]!
    let state = withCapturedCaptain(base, p1cap.id, 'p2', 5)
    state = applyAction(state, { type: 'endTurn', playerId: 'p1' })
    state = applyAction(state, { type: 'resign', playerId: 'p2' })
    const released = state.captains.find((c) => c.id === p1cap.id)!
    expect(released.captured).toBe(true)
    expect(released.capturedBy).toBeUndefined()
    expect(released.captivityReturnRound).toBe(state.round)
  })
})

describe('ransomCaptain action (#309)', () => {
  it('pays the captor and makes the captive immediately eligible for recruitment', () => {
    const base = createGame(testConfig(2))
    const p1cap = captainsOf(base, 'p1')[0]!
    const withXp: GameState = {
      ...base,
      captains: base.captains.map((c) => (c.id === p1cap.id ? { ...c, xp: 20 } : c)),
    }
    const state = withCapturedCaptain(withXp, p1cap.id, 'p2', 5)
    const p1GoldBefore = state.players.find((p) => p.id === 'p1')!.resources.gold
    const p2GoldBefore = state.players.find((p) => p.id === 'p2')!.resources.gold
    const cost = Math.ceil(GAME_SETUP.ransomBaseCost + 20 * GAME_SETUP.ransomXpMultiplier)

    const next = applyAction(state, { type: 'ransomCaptain', playerId: 'p1', captainId: p1cap.id })
    expect(next.players.find((p) => p.id === 'p1')!.resources.gold).toBe(p1GoldBefore - cost)
    expect(next.players.find((p) => p.id === 'p2')!.resources.gold).toBe(p2GoldBefore + cost)
    // Ransom alone doesn't reactivate the captain — recruitCaptain still does that.
    const ransomed = next.captains.find((c) => c.id === p1cap.id)!
    expect(ransomed.captured).toBe(true)
    expect(ransomed.captivityReturnRound).toBe(next.round)
  })

  it('rejects ransoming a captain that is not captured', () => {
    const state = createGame(testConfig(2))
    const p1cap = captainsOf(state, 'p1')[0]!
    expect(() =>
      applyAction(state, { type: 'ransomCaptain', playerId: 'p1', captainId: p1cap.id }),
    ).toThrow(InvalidActionError)
  })

  it('rejects ransoming a captain you do not own', () => {
    const base = createGame(testConfig(2))
    const p2cap = captainsOf(base, 'p2')[0]!
    const state = withCapturedCaptain(base, p2cap.id, 'p1', 5)
    expect(() =>
      applyAction(state, { type: 'ransomCaptain', playerId: 'p1', captainId: p2cap.id }),
    ).toThrow(InvalidActionError)
  })

  it('does not require a tavern (#433) — ransom pays a captor, it is not a hire', () => {
    // Content is configured with a tavern building, but no city has built one:
    // ransomCaptain must still succeed, unlike recruitCaptain.
    const base = createGame({ ...testConfig(2), content: CAPTAIN_CATALOG })
    const p1cap = captainsOf(base, 'p1')[0]!
    const state = withCapturedCaptain(base, p1cap.id, 'p2', 5)
    const next = applyAction(state, { type: 'ransomCaptain', playerId: 'p1', captainId: p1cap.id })
    expect(next.captains.find((c) => c.id === p1cap.id)!.captivityReturnRound).toBe(next.round)
  })
})

// Far enough from the port row (below) that a home city's own vision disc
// (cityVisionRadius: 3, see fixtures.ts) never reaches the lane the captains
// sail along — otherwise city vision could mask the bugs the fog suites below
// target.
const LANE_Y = 8

/**
 * A straight, all-deep-water lane, long enough for multi-step moves, with the
 * two players parked at either end. Gives full control over path shape and
 * length, unlike the generated map used elsewhere in this file. Shared by the
 * fog-of-war suites (#295, #522).
 */
function laneConfig(length: number, movement = GAME_SETUP.startingCaptainMovement): GameConfig {
  const width = length + 1
  const height = LANE_Y + 1
  const tiles: Tile[] = Array.from({ length: width * height }, () => ({
    type: 'deep',
    island: -1,
  }))
  // Each seat's capital sits on a port tile (createGame looks one up per home
  // island); tuck them onto row y=0, far from the y=LANE_Y row the captains
  // actually sail along.
  tiles[0 * width + 0] = { type: 'port', island: 0 }
  tiles[0 * width + (width - 1)] = { type: 'port', island: 1 }
  const mapDefinition: MapDefinition = {
    width,
    height,
    tiles,
    startPositions: [
      { x: 0, y: LANE_Y },
      { x: width - 1, y: LANE_Y },
    ],
  }
  return {
    seed: 1,
    mapSize: 'medium',
    mapDefinition,
    setup: { ...GAME_SETUP, startingCaptainMovement: movement },
    players: [
      { id: 'p1', name: 'Player 1', faction: 'pirates', isAI: false },
      { id: 'p2', name: 'Player 2', faction: 'british', isAI: true },
    ],
  }
}

describe('fog of war along a travel path (#295)', () => {
  it.each([1, 2, 3, 5])(
    'explores every tile crossed by a %d-step move, not just the destination',
    (steps) => {
      const state = createGame(laneConfig(10))
      const cap = captainsOf(state, 'p1')[0]!
      const to = { x: cap.position.x + steps, y: cap.position.y }
      const path = findPath(state.map, cap.position, to)!
      expect(path).toHaveLength(steps + 1)

      const next = applyAction(state, {
        type: 'moveCaptain',
        playerId: 'p1',
        captainId: cap.id,
        to,
      })

      const explored = new Set(next.exploredTiles['p1'] ?? [])
      const { captainVisionRadius } = state.config.setup
      for (const step of path) {
        for (const tile of tilesInRadius(step, captainVisionRadius, state.map)) {
          expect(explored.has(tileKey(tile))).toBe(true)
        }
      }
    },
  )

  it('remembers a wake tile far from both endpoints even though it drops out of live vision', () => {
    // A long single move (well beyond 2x vision radius) so the midpoint of the
    // path sits outside *both* the spawn-time vision disc and the
    // destination's vision disc — the only way to tell this fix apart from
    // folding just the endpoints.
    const movement = 10
    const state = createGame(laneConfig(20, movement))
    const cap = captainsOf(state, 'p1')[0]!
    const start = { ...cap.position }
    const to = { x: start.x + movement, y: start.y }
    const path = findPath(state.map, start, to)!
    const wake = path[Math.floor(path.length / 2)]!

    // Guard: the midpoint tile is genuinely outside both endpoints' vision
    // discs, otherwise this test wouldn't distinguish the fix from the old
    // behaviour (which only ever folded the start and destination discs).
    const { captainVisionRadius } = state.config.setup
    expect(chebyshevDistance(start, wake)).toBeGreaterThan(captainVisionRadius)
    expect(chebyshevDistance(to, wake)).toBeGreaterThan(captainVisionRadius)

    const next = applyAction(state, {
      type: 'moveCaptain',
      playerId: 'p1',
      captainId: cap.id,
      to,
    })

    expect(next.exploredTiles['p1']).toContain(tileKey(wake))
    expect(currentlyVisibleTiles(next, 'p1').map(tileKey)).not.toContain(tileKey(wake))
  })

  it('replays identically across moves of varying length, with the full wake explored', () => {
    const log: Action[] = [
      { type: 'moveCaptain', playerId: 'p1', captainId: 'cap-p1', to: { x: 2, y: LANE_Y } },
      { type: 'endTurn', playerId: 'p1' },
      { type: 'moveCaptain', playerId: 'p2', captainId: 'cap-p2', to: { x: 8, y: LANE_Y } },
      { type: 'endTurn', playerId: 'p2' },
      { type: 'moveCaptain', playerId: 'p1', captainId: 'cap-p1', to: { x: 5, y: LANE_Y } },
      { type: 'endTurn', playerId: 'p1' },
    ]
    const a = replay(createGame(laneConfig(10)), log)
    const b = replay(createGame(laneConfig(10)), log)
    expect(JSON.stringify(a)).toBe(JSON.stringify(b))

    for (let x = 0; x <= 5; x++) {
      expect(a.exploredTiles['p1']).toContain(tileKey({ x, y: LANE_Y }))
    }
  })
})

describe('captured captains grant no vision (#522)', () => {
  /**
   * Sail p1's captain far down the lane — well outside its capital's vision
   * disc — then mark it captured on the spot, the position a real capture
   * freezes it at for the whole captivity.
   */
  function captiveFarFromHome() {
    const movement = 10
    const state = createGame(laneConfig(20, movement))
    const cap = captainsOf(state, 'p1')[0]!
    const site = { x: cap.position.x + movement, y: cap.position.y }
    const moved = applyAction(state, {
      type: 'moveCaptain',
      playerId: 'p1',
      captainId: cap.id,
      to: site,
    })
    return { captured: withCapturedCaptain(moved, cap.id, 'p2', 0), moved, capId: cap.id, site }
  }

  it('revokes live vision around the capture site the moment the captain is captured', () => {
    const { captured, moved, site } = captiveFarFromHome()
    // Guard: before the capture, the site really was lit by this captain alone.
    expect(currentlyVisibleTiles(moved, 'p1').map(tileKey)).toContain(tileKey(site))
    const visible = new Set(currentlyVisibleTiles(captured, 'p1').map(tileKey))
    const { captainVisionRadius } = captured.config.setup
    for (const tile of tilesInRadius(site, captainVisionRadius, captured.map)) {
      expect(visible.has(tileKey(tile))).toBe(false)
    }
  })

  it('keeps the capture site explored (fog memory) across later actions while it stays dark', () => {
    const { captured, site } = captiveFarFromHome()
    const next = applyAction(captured, { type: 'endTurn', playerId: 'p1' })
    const explored = new Set(next.exploredTiles['p1'] ?? [])
    const { captainVisionRadius } = next.config.setup
    for (const tile of tilesInRadius(site, captainVisionRadius, next.map)) {
      expect(explored.has(tileKey(tile))).toBe(true)
    }
    expect(currentlyVisibleTiles(next, 'p1').map(tileKey)).not.toContain(tileKey(site))
  })

  it('restores live vision the moment the captain returns to service', () => {
    // recruitCaptain's rehire path clears `captured` (asserted by the #309
    // suites above); visibility recomputes live from that flag, so clearing it
    // is the whole restoration story.
    const { captured, capId, site } = captiveFarFromHome()
    const freed: GameState = {
      ...captured,
      captains: captured.captains.map((c) => {
        if (c.id !== capId) return c
        const { capturedBy: _by, captivityReturnRound: _round, ...rest } = c
        return { ...rest, captured: false }
      }),
    }
    expect(currentlyVisibleTiles(freed, 'p1').map(tileKey)).toContain(tileKey(site))
  })

  it('replays a log with a captive in play to a bit-identical state', () => {
    const { captured } = captiveFarFromHome()
    const log: Action[] = [
      { type: 'endTurn', playerId: 'p1' },
      { type: 'moveCaptain', playerId: 'p2', captainId: 'cap-p2', to: { x: 15, y: LANE_Y } },
      { type: 'endTurn', playerId: 'p2' },
      { type: 'endTurn', playerId: 'p1' },
    ]
    const a = replay(captured, log)
    const b = replay(captured, log)
    expect(JSON.stringify(a)).toBe(JSON.stringify(b))
    expect(a.actionCount).toBe(captured.actionCount + log.length)
  })
})
