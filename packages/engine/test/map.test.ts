import { describe, expect, it } from 'vitest'
import type { MapSize } from '@aop/shared'
import { chebyshevDistance } from '@aop/shared'
import {
  generateMap as generateMapRaw,
  isWaterTile,
  MAP_DIMENSIONS,
  neighbors8,
  tileAt,
  tileIndex,
  type GameMap,
} from '../src'
import { GAME_SETUP } from './fixtures'

/** Wrap the generator with the home-island radius and ring factor the engine now receives from content. */
const generateMap = (seed: number, mapSize: MapSize, playerCount: number): GameMap =>
  generateMapRaw(
    seed,
    mapSize,
    playerCount,
    GAME_SETUP.homeIslandRadius,
    GAME_SETUP.homeIslandRingRadiusFactor,
  )

function landCount(map: GameMap): number {
  return map.tiles.filter((t) => t.type === 'land' || t.type === 'port').length
}

function homeIslandLand(map: GameMap, island: number): number {
  return map.tiles.filter((t) => t.island === island && (t.type === 'land' || t.type === 'port'))
    .length
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
    for (const size of ['small', 'medium', 'large'] as MapSize[]) {
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
