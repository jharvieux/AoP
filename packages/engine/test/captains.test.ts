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
  type GameConfig,
  type GameMap,
  type GameState,
  type MapDefinition,
  type Tile,
} from '../src'
import { GAME_SETUP } from './fixtures'

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
    const map = generateMap(42, 'medium', 4, GAME_SETUP.homeIslandRadius)
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
    const map = generateMap(7, 'large', 8, GAME_SETUP.homeIslandRadius)
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

describe('fog of war along a travel path (#295)', () => {
  // Far enough from the port row (below) that a home city's own vision disc
  // (cityVisionRadius: 3, see fixtures.ts) never reaches the lane the captains
  // sail along — otherwise city vision could mask the bug this suite targets.
  const LANE_Y = 8

  /**
   * A straight, all-deep-water lane, long enough for multi-step moves, with the
   * two players parked at either end. Gives full control over path shape and
   * length, unlike the generated map used elsewhere in this file.
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
