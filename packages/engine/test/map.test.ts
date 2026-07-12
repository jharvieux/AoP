import { describe, expect, it } from 'vitest'
import type { MapSize } from '@aop/shared'
import { chebyshevDistance } from '@aop/shared'
import {
  generateMap as generateMapRaw,
  isWaterTile,
  MAP_DIMENSIONS,
  mapNeighbors,
  mapToDefinition,
  neighbors8,
  tileAt,
  tileIndex,
  validateMapDefinition,
  type GameMap,
  type GridTopology,
} from '../src'
import { GAME_SETUP, MAP_VALIDATION_LIMITS } from './fixtures'

/**
 * Wrap the generator with the home-island radius and ring factor the engine now
 * receives from content — including the #468 per-size radius override, mirroring
 * how `createGame` resolves it in `game.ts`.
 */
const generateMap = (
  seed: number,
  mapSize: MapSize,
  playerCount: number,
  topology?: GridTopology,
): GameMap =>
  generateMapRaw(
    seed,
    mapSize,
    playerCount,
    GAME_SETUP.homeIslandRadiusOverrides?.[mapSize] ?? GAME_SETUP.homeIslandRadius,
    GAME_SETUP.homeIslandRingRadiusFactor,
    topology,
  )

function landCount(map: GameMap): number {
  return map.tiles.filter((t) => t.type === 'land' || t.type === 'port').length
}

function homeIslandLand(map: GameMap, island: number): number {
  return map.tiles.filter((t) => t.island === island && (t.type === 'land' || t.type === 'port'))
    .length
}

function neutralIslandCount(map: GameMap, playerCount: number): number {
  const islands = new Set(
    map.tiles
      .filter((t) => (t.type === 'land' || t.type === 'port') && t.island >= playerCount)
      .map((t) => t.island),
  )
  return islands.size
}

describe('generateMap determinism', () => {
  it('is a pure function of (seed, mapSize, playerCount)', () => {
    expect(generateMap(1, 'medium', 4)).toEqual(generateMap(1, 'medium', 4))
    expect(generateMap(999, 'large', 6)).toEqual(generateMap(999, 'large', 6))
  })

  it('produces different maps for different seeds', () => {
    const a = generateMap(1, 'medium', 4)
    const b = generateMap(2, 'medium', 4)
    expect(a).not.toEqual(b)
  })

  it('respects the size table', () => {
    for (const size of ['small', 'medium', 'large', 'xlarge'] as MapSize[]) {
      const map = generateMap(7, size, 2)
      expect(map.width).toBe(MAP_DIMENSIONS[size])
      expect(map.height).toBe(MAP_DIMENSIONS[size])
      expect(map.tiles.length).toBe(map.width * map.height)
    }
  })
})

describe('map composition', () => {
  it('is mostly sea with a sane land ratio', () => {
    for (const seed of [1, 2, 3, 42, 100]) {
      const map = generateMap(seed, 'medium', 4)
      const ratio = landCount(map) / map.tiles.length
      expect(ratio).toBeGreaterThan(0.03)
      expect(ratio).toBeLessThan(0.45)
    }
  })

  it('wraps land in shallows (coastlines)', () => {
    const map = generateMap(5, 'medium', 4)
    // Every land tile touches either land or shallows — never bare deep water.
    for (let y = 0; y < map.height; y++) {
      for (let x = 0; x < map.width; x++) {
        const tile = map.tiles[tileIndex(map, x, y)]!
        if (tile.type !== 'land') continue
        const touchesDeep = neighbors8(map, { x, y }).some(
          (n) => map.tiles[tileIndex(map, n.x, n.y)]!.type === 'deep',
        )
        expect(touchesDeep).toBe(false)
      }
    }
  })
})

describe('start positions', () => {
  it('gives one water start per player', () => {
    for (const count of [2, 3, 4, 6, 8]) {
      const map = generateMap(11, 'large', count)
      expect(map.startPositions).toHaveLength(count)
      for (const s of map.startPositions) {
        expect(isWaterTile(tileAt(map, s))).toBe(true)
      }
    }
  })

  it('places every start adjacent to a port', () => {
    const map = generateMap(11, 'medium', 4)
    for (const s of map.startPositions) {
      const nextToPort = neighbors8(map, s).some((n) => tileAt(map, n)?.type === 'port')
      expect(nextToPort).toBe(true)
    }
  })

  it('is fair: every home island is identically sized', () => {
    const map = generateMap(11, 'medium', 4)
    const sizes = map.startPositions.map((_, i) => homeIslandLand(map, i))
    expect(Math.max(...sizes)).toBe(Math.min(...sizes))
  })

  it('is fair: starts are near-equidistant from the map centre', () => {
    const map = generateMap(11, 'large', 6)
    const center = { x: (map.width - 1) / 2, y: (map.height - 1) / 2 }
    const dists = map.startPositions.map((s) => Math.hypot(s.x - center.x, s.y - center.y))
    // Rounding to the grid introduces at most ~1.5 tiles of spread.
    expect(Math.max(...dists) - Math.min(...dists)).toBeLessThan(2)
  })

  it('is fair: no two starts are crowded together', () => {
    const map = generateMap(11, 'large', 4)
    for (let i = 0; i < map.startPositions.length; i++) {
      for (let j = i + 1; j < map.startPositions.length; j++) {
        expect(chebyshevDistance(map.startPositions[i]!, map.startPositions[j]!)).toBeGreaterThan(4)
      }
    }
  })

  it('places every hex-map start hex-adjacent to a port (not merely square-diagonal)', () => {
    const map = generateMap(11, 'medium', 4, 'hex')
    for (const s of map.startPositions) {
      const nextToPort = mapNeighbors(map, s).some((n) => tileAt(map, n)?.type === 'port')
      expect(nextToPort).toBe(true)
    }
  })

  it('respects the ring radius factor for home island placement', () => {
    // At 0.40 factor, a 32-tile medium map should have ring radius ~12.8 tiles.
    // Start positions are water tiles adjacent to ports at the island edge, so they sit
    // roughly homeIslandRadius closer to center: ~12.8 - 2 = ~10.8 tiles away.
    // Account for rounding, grid quantization, and phase rotation: ±2.5 tiles tolerance.
    const map = generateMap(11, 'medium', 4)
    const center = { x: (map.width - 1) / 2, y: (map.height - 1) / 2 }
    const expectedRadius = map.width * GAME_SETUP.homeIslandRingRadiusFactor
    const dists = map.startPositions.map((s) => Math.hypot(s.x - center.x, s.y - center.y))
    const avgDist = dists.reduce((a, b) => a + b, 0) / dists.length
    expect(avgDist).toBeGreaterThan(expectedRadius - GAME_SETUP.homeIslandRadius - 2.5)
    expect(avgDist).toBeLessThan(expectedRadius - GAME_SETUP.homeIslandRadius + 2.5)
  })
})

describe('generation topology (#348)', () => {
  const SEEDS = [1, 2, 3, 5, 7, 11, 42, 99, 123, 999]

  it('generates valid square maps across seeds', () => {
    for (const seed of SEEDS) {
      const map = generateMap(seed, 'medium', 4, 'square')
      const result = validateMapDefinition(mapToDefinition(map), MAP_VALIDATION_LIMITS)
      expect(result.errors).toEqual([])
    }
  })

  it('generates valid hex maps across seeds', () => {
    for (const seed of SEEDS) {
      const map = generateMap(seed, 'medium', 4, 'hex')
      const result = validateMapDefinition(mapToDefinition(map), MAP_VALIDATION_LIMITS)
      expect(result.errors).toEqual([])
    }
  })

  it('stamps topology: hex on hex maps and omits the field on square maps', () => {
    expect(generateMap(7, 'small', 2, 'hex').topology).toBe('hex')
    // Omission (not `undefined`) keeps serialized square maps byte-identical.
    expect('topology' in generateMap(7, 'small', 2)).toBe(false)
    expect('topology' in generateMap(7, 'small', 2, 'square')).toBe(false)
  })

  it('square output is byte-identical whether topology is omitted or explicit', () => {
    expect(generateMap(11, 'large', 6, 'square')).toEqual(generateMap(11, 'large', 6))
  })

  it('hex generation is deterministic per seed', () => {
    expect(generateMap(42, 'medium', 4, 'hex')).toEqual(generateMap(42, 'medium', 4, 'hex'))
  })

  it('hex maps have water starts for every player count', () => {
    for (const count of [2, 3, 4, 6, 8]) {
      const map = generateMap(11, 'large', count, 'hex')
      expect(map.startPositions).toHaveLength(count)
      for (const s of map.startPositions) {
        expect(isWaterTile(tileAt(map, s))).toBe(true)
      }
    }
  })

  it('hex coastlines follow hex adjacency: no land hex touches deep water', () => {
    const map = generateMap(5, 'medium', 4, 'hex')
    for (let y = 0; y < map.height; y++) {
      for (let x = 0; x < map.width; x++) {
        const tile = map.tiles[tileIndex(map, x, y)]!
        if (tile.type !== 'land') continue
        const touchesDeep = mapNeighbors(map, { x, y }).some(
          (n) => map.tiles[tileIndex(map, n.x, n.y)]!.type === 'deep',
        )
        expect(touchesDeep).toBe(false)
      }
    }
  })
})

describe('extra-large size (#468)', () => {
  it('is a pure function of (seed, mapSize, playerCount), like every other size', () => {
    expect(generateMap(1, 'xlarge', 4)).toEqual(generateMap(1, 'xlarge', 4))
    expect(generateMap(1, 'xlarge', 4)).not.toEqual(generateMap(2, 'xlarge', 4))
  })

  it('is the widest board and stays a sane land ratio', () => {
    for (const seed of [1, 2, 3, 42, 100]) {
      const map = generateMap(seed, 'xlarge', 4)
      expect(map.width).toBe(MAP_DIMENSIONS.xlarge)
      expect(map.width).toBeGreaterThan(MAP_DIMENSIONS.large)
      const ratio = landCount(map) / map.tiles.length
      expect(ratio).toBeGreaterThan(0.03)
      expect(ratio).toBeLessThan(0.45)
    }
  })

  it('gives home islands more interior land than large — bigger islands, not just bigger sea', () => {
    const large = generateMap(11, 'large', 4)
    const xlarge = generateMap(11, 'xlarge', 4)
    expect(homeIslandLand(xlarge, 0)).toBeGreaterThan(homeIslandLand(large, 0))
  })

  it('is fair: every xlarge home island is identically sized', () => {
    const map = generateMap(11, 'xlarge', 4)
    const sizes = map.startPositions.map((_, i) => homeIslandLand(map, i))
    expect(Math.max(...sizes)).toBe(Math.min(...sizes))
  })

  it('scales the neutral island count up from large, per the size/6..size/4 formula', () => {
    const large = generateMap(11, 'large', 4)
    const xlarge = generateMap(11, 'xlarge', 4)
    expect(neutralIslandCount(xlarge, 4)).toBeGreaterThanOrEqual(neutralIslandCount(large, 4))
  })

  it('gives one water start per player, for every supported player count', () => {
    for (const count of [2, 3, 4, 6, 8]) {
      const map = generateMap(21, 'xlarge', count)
      expect(map.startPositions).toHaveLength(count)
      for (const s of map.startPositions) {
        expect(isWaterTile(tileAt(map, s))).toBe(true)
      }
    }
  })

  it('validates as an authored map definition, aside from the deliberately-untouched size ceiling', () => {
    const map = generateMap(11, 'xlarge', 4)
    const result = validateMapDefinition(mapToDefinition(map), MAP_VALIDATION_LIMITS)
    // xlarge (48) exceeds MAP_VALIDATION_LIMITS.maxSize (40, the authored/community-map
    // ceiling — deliberately untouched by #468, see #473), so exactly the two
    // dimension-ceiling errors are expected; anything else would mean the generated map
    // itself is malformed.
    expect(result.errors.map((e) => e.code).sort()).toEqual([
      'height-out-of-bounds',
      'width-out-of-bounds',
    ])
  })
})
