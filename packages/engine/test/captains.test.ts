import { describe, expect, it } from 'vitest'
import { chebyshevDistance, coordsEqual, type Coord } from '@aop/shared'
import {
  applyAction,
  captainsOf,
  createGame,
  currentPlayer,
  findPath,
  generateMap,
  InvalidActionError,
  isWaterTile,
  pathCost,
  replay,
  tileAt,
  type Action,
  type GameConfig,
  type GameMap,
  type GameState,
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
