import { describe, expect, it } from 'vitest'
import type { Coord } from '@aop/shared'
import { chebyshevDistance } from '@aop/shared'
import {
  applyAction,
  createGame,
  findPath,
  generateMap,
  hexToCart,
  mapDistance,
  mapNeighbors,
  mapToDefinition,
  offsetToCube,
  replay,
  runAiTurn,
  tilesInRadius,
  validateMapDefinition,
  type Action,
  type GameConfig,
  type GameMap,
  type MapDefinition,
  type Tile,
} from '../src'
import { GAME_SETUP, MAP_VALIDATION_LIMITS } from './fixtures'

/**
 * Hex-grid engine integration (#348, Phase 2). The topology switch must hold
 * both halves of the contract: square maps behave byte-identically to before
 * (the existing replay suite is that contract; the square cases here are
 * targeted regression guards), and hex maps get true 6-neighbor adjacency,
 * hex distance, and hex pathfinding through the same engine entry points —
 * same action shapes, same reducer, same error codes.
 */

const SIZE = 24

/** All-deep-water hex map with two single-tile port islands and given starts. */
function hexTestMap(startPositions: Coord[]): MapDefinition {
  const tiles: Tile[] = Array.from({ length: SIZE * SIZE }, () => ({
    type: 'deep',
    island: -1,
  }))
  const map: MapDefinition = { width: SIZE, height: SIZE, tiles, startPositions, topology: 'hex' }
  tiles[2 * SIZE + 2] = { type: 'port', island: 0 } // (2,2) — player 1's capital
  tiles[20 * SIZE + 20] = { type: 'port', island: 1 } // (20,20) — player 2's capital
  return map
}

function hexConfig(startPositions: Coord[]): GameConfig {
  return {
    seed: 42,
    mapSize: 'small',
    setup: GAME_SETUP,
    mapDefinition: hexTestMap(startPositions),
    players: [
      { id: 'p1', name: 'Player 1', faction: 'pirates', isAI: false },
      { id: 'p2', name: 'Player 2', faction: 'british', isAI: true },
    ],
  }
}

function squareTestMap(): GameMap {
  return generateMap(
    7,
    'small',
    2,
    GAME_SETUP.homeIslandRadius,
    GAME_SETUP.homeIslandRingRadiusFactor,
  )
}

describe('topology-aware adjacency (mapNeighbors)', () => {
  it('every non-boundary hex has exactly 6 in-bounds, mutual, distance-1 neighbors', () => {
    const map = hexTestMap([])
    for (let y = 1; y < SIZE - 1; y++) {
      for (let x = 1; x < SIZE - 1; x++) {
        const neighbors = mapNeighbors(map, { x, y })
        expect(neighbors).toHaveLength(6)
        for (const n of neighbors) {
          expect(n.x >= 0 && n.x < SIZE && n.y >= 0 && n.y < SIZE).toBe(true)
          expect(mapDistance(map, { x, y }, n)).toBe(1)
          // Symmetry: adjacency is mutual.
          expect(mapNeighbors(map, n)).toContainEqual({ x, y })
        }
        // No duplicates.
        expect(new Set(neighbors.map((n) => `${n.x},${n.y}`)).size).toBe(6)
      }
    }
  })

  it('boundary hexes have fewer than 6 neighbors', () => {
    const map = hexTestMap([])
    expect(mapNeighbors(map, { x: 0, y: 0 }).length).toBeLessThan(6)
    expect(mapNeighbors(map, { x: SIZE - 1, y: SIZE - 1 }).length).toBeLessThan(6)
  })

  it('square maps keep the original 8-neighbor king moves (regression)', () => {
    const map = squareTestMap()
    const neighbors = mapNeighbors(map, { x: 5, y: 5 })
    expect(neighbors).toHaveLength(8)
    expect(neighbors).toContainEqual({ x: 4, y: 4 }) // diagonal — square-only
  })
})

describe('topology-aware distance (mapDistance)', () => {
  it('square diagonals cost 1 on square maps but 2 on hex maps', () => {
    const square = squareTestMap()
    const hex = hexTestMap([])
    expect(mapDistance(square, { x: 2, y: 3 }, { x: 1, y: 2 })).toBe(1)
    expect(mapDistance(hex, { x: 2, y: 3 }, { x: 1, y: 2 })).toBe(2)
  })

  it('matches Chebyshev everywhere on square maps (regression)', () => {
    const map = squareTestMap()
    for (let y = 0; y < 12; y++) {
      for (let x = 0; x < 12; x++) {
        expect(mapDistance(map, { x: 6, y: 6 }, { x, y })).toBe(
          chebyshevDistance({ x: 6, y: 6 }, { x, y }),
        )
      }
    }
  })

  it('hex distance stays within [1x, 1.5x] of the straight-line distance', () => {
    // Straight-line distance measured between hex centres (hexToCart, size-1
    // pointy-top hexes), normalized so adjacent centres are 1 apart (√3).
    const map = hexTestMap([])
    const SQRT3 = Math.sqrt(3)
    const from = { x: 5, y: 5 }
    const cartFrom = hexToCart(offsetToCube({ col: from.x, row: from.y }))
    for (let y = 0; y < 16; y++) {
      for (let x = 0; x < 16; x++) {
        if (x === from.x && y === from.y) continue
        const cart = hexToCart(offsetToCube({ col: x, row: y }))
        const euclid = Math.hypot(cart.x - cartFrom.x, cart.y - cartFrom.y) / SQRT3
        const hexDist = mapDistance(map, from, { x, y })
        expect(hexDist).toBeGreaterThanOrEqual(euclid - 1e-9)
        expect(hexDist).toBeLessThanOrEqual(1.5 * euclid + 1e-9)
      }
    }
  })
})

describe('hex pathfinding through the core findPath', () => {
  /** Wall of land at x=12 with a single gap at the bottom row, forcing a detour. */
  function walledHexMap(): GameMap {
    const map = hexTestMap([])
    for (let y = 0; y < SIZE - 1; y++) {
      map.tiles[y * SIZE + 12] = { type: 'land', island: 2 }
    }
    return map
  }

  it('open-water path cost equals hex distance and every step is hex-adjacent', () => {
    const map = hexTestMap([])
    const from = { x: 3, y: 4 }
    const to = { x: 18, y: 15 }
    const path = findPath(map, from, to)
    expect(path).not.toBeNull()
    expect(path!.length - 1).toBe(mapDistance(map, from, to))
    for (let i = 1; i < path!.length; i++) {
      expect(mapDistance(map, path![i - 1]!, path![i]!)).toBe(1)
    }
  })

  it('detours around obstacles with a genuinely longer but valid hex path', () => {
    const map = walledHexMap()
    const from = { x: 2, y: 3 }
    const to = { x: 20, y: 3 }
    const path = findPath(map, from, to)
    expect(path).not.toBeNull()
    expect(path!.length - 1).toBeGreaterThan(mapDistance(map, from, to))
    for (let i = 1; i < path!.length; i++) {
      expect(mapDistance(map, path![i - 1]!, path![i]!)).toBe(1)
    }
  })

  it('returns a byte-identical path across 100 independent runs', () => {
    // A fresh map object per run defeats the per-map component cache, so every
    // run recomputes the full search from scratch.
    const first = JSON.stringify(findPath(walledHexMap(), { x: 2, y: 3 }, { x: 20, y: 3 }))
    for (let run = 0; run < 100; run++) {
      const path = findPath(walledHexMap(), { x: 2, y: 3 }, { x: 20, y: 3 })
      expect(JSON.stringify(path)).toBe(first)
    }
  })
})

describe('reducer on a hex map (same actions, same error codes)', () => {
  it('moves to a hex neighbor for 1 movement point', () => {
    const state = createGame(
      hexConfig([
        { x: 2, y: 3 },
        { x: 20, y: 21 },
      ]),
    )
    const next = applyAction(state, {
      type: 'moveCaptain',
      playerId: 'p1',
      captainId: 'cap-p1',
      to: { x: 3, y: 3 },
    })
    const cap = next.captains.find((c) => c.id === 'cap-p1')!
    expect(cap.position).toEqual({ x: 3, y: 3 })
    expect(cap.movementPoints).toBe(GAME_SETUP.startingCaptainMovement - 1)
  })

  it('a square-diagonal step costs 2 (it is not hex-adjacent)', () => {
    const state = createGame(
      hexConfig([
        { x: 2, y: 3 },
        { x: 20, y: 21 },
      ]),
    )
    const next = applyAction(state, {
      type: 'moveCaptain',
      playerId: 'p1',
      captainId: 'cap-p1',
      to: { x: 1, y: 2 },
    })
    const cap = next.captains.find((c) => c.id === 'cap-p1')!
    expect(cap.movementPoints).toBe(GAME_SETUP.startingCaptainMovement - 2)
  })

  it('rejects an attack on a square-diagonal target: hex distance 2 is out of range', () => {
    // (2,3) → (1,2) is Chebyshev-adjacent — a legal attack on a square map —
    // but two hex steps apart, so on a hex map it must bounce, with the same
    // error a plain out-of-range attack has always produced.
    const state = createGame(
      hexConfig([
        { x: 2, y: 3 },
        { x: 1, y: 2 },
      ]),
    )
    expect(() =>
      applyAction(state, {
        type: 'attackCaptain',
        playerId: 'p1',
        captainId: 'cap-p1',
        targetCaptainId: 'cap-p2',
      }),
    ).toThrow(/not within attack range/)
  })

  it('accepts the range check for a hex-adjacent target', () => {
    // The config carries no combat stats, so a hex-adjacent attack must get
    // past the range gate and fail on the *later* stats check instead.
    const state = createGame(
      hexConfig([
        { x: 2, y: 3 },
        { x: 3, y: 3 },
      ]),
    )
    expect(() =>
      applyAction(state, {
        type: 'attackCaptain',
        playerId: 'p1',
        captainId: 'cap-p1',
        targetCaptainId: 'cap-p2',
      }),
    ).toThrow(/No combat stats/)
  })
})

describe('hex map validation and vision', () => {
  it('validateMapDefinition accepts the authored hex map under hex adjacency', () => {
    const def = hexTestMap([
      { x: 2, y: 3 },
      { x: 20, y: 21 },
    ])
    expect(validateMapDefinition(def, MAP_VALIDATION_LIMITS)).toEqual({ valid: true, errors: [] })
  })

  it('mapToDefinition preserves hex topology and omits it for square maps', () => {
    expect(mapToDefinition(hexTestMap([])).topology).toBe('hex')
    expect('topology' in mapToDefinition(squareTestMap())).toBe(false)
  })

  it('tilesInRadius yields the hex ball on hex maps and the full box on square maps', () => {
    // Radius-2 hex ball: 1 + 6 + 12 = 19 hexes; radius-2 Chebyshev box: 25.
    expect(tilesInRadius({ x: 10, y: 10 }, 2, hexTestMap([]))).toHaveLength(19)
    expect(tilesInRadius({ x: 10, y: 10 }, 2, squareTestMap())).toHaveLength(25)
  })
})

describe('determinism on hex maps', () => {
  const log: Action[] = [
    { type: 'moveCaptain', playerId: 'p1', captainId: 'cap-p1', to: { x: 6, y: 5 } },
    { type: 'endTurn', playerId: 'p1' },
    { type: 'moveCaptain', playerId: 'p2', captainId: 'cap-p2', to: { x: 17, y: 19 } },
    { type: 'endTurn', playerId: 'p2' },
    { type: 'moveCaptain', playerId: 'p1', captainId: 'cap-p1', to: { x: 9, y: 8 } },
    { type: 'endTurn', playerId: 'p1' },
  ]
  const config = () =>
    hexConfig([
      { x: 2, y: 3 },
      { x: 20, y: 21 },
    ])

  it('replaying the same log yields an identical state', () => {
    const a = replay(createGame(config()), log)
    const b = replay(createGame(config()), log)
    expect(JSON.stringify(a)).toBe(JSON.stringify(b))
  })

  it('GameState with a hex map survives a JSON round-trip and replays identically after it', () => {
    const state = replay(createGame(config()), log.slice(0, 2))
    const revived = JSON.parse(JSON.stringify(state))
    expect(revived).toEqual(state)
    const a = replay(state, log.slice(2))
    const b = replay(revived, log.slice(2))
    expect(JSON.stringify(a)).toBe(JSON.stringify(b))
  })

  it('the AI plays a legal, deterministic turn on a hex grid', () => {
    const start = replay(createGame(config()), [{ type: 'endTurn', playerId: 'p1' }])
    const a = runAiTurn(start, 'p2')
    const b = runAiTurn(start, 'p2')
    expect(JSON.stringify(a)).toBe(JSON.stringify(b))

    // The AI advanced on the enemy over water, within its movement allowance,
    // and closed distance (its scorer works in hex space now).
    const before = start.captains.find((c) => c.id === 'cap-p2')!
    const after = a.captains.find((c) => c.id === 'cap-p2')!
    expect(mapDistance(a.map, before.position, after.position)).toBeLessThanOrEqual(
      GAME_SETUP.startingCaptainMovement,
    )
    expect(a.map.tiles[after.position.y * SIZE + after.position.x]!.type).toBe('deep')
    const enemy = a.captains.find((c) => c.id === 'cap-p1')!
    expect(mapDistance(a.map, after.position, enemy.position)).toBeLessThan(
      mapDistance(a.map, before.position, enemy.position),
    )
  })
})
