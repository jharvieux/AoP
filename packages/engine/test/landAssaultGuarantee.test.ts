import type { MapSize } from '@aop/shared'
import { describe, expect, it } from 'vitest'
import {
  generateMap as generateMapRaw,
  hasLandAssaultRoute,
  isWaterTile,
  navigableWaterTiles,
  seedForLandContent,
  seedInlandSettlements,
  tileAt,
  tileIndex,
  type GameMap,
  type GridTopology,
  type Tile,
  type TileType,
} from '../src'
import { GAME_SETUP } from './fixtures'

/**
 * The land-assault guarantee (operator directive, 2026-07-14): on EVERY map,
 * every capital — and every inland settlement the land-content seeder would
 * place — must be attackable by a landing party that comes ashore on a land
 * tile adjacent to navigable water, NOT adjacent to the city itself, and
 * marches overland to an assault position. Land warfare is a structural
 * property of the board, never a lucky seed.
 *
 * This is a property-style battery: a fixed seed range per size preset and
 * topology (deterministic, so failures are exactly reproducible), asserting
 * the guarantee for every generated capital. The generator enforces it via an
 * RNG-free repair post-pass (`ensureLandAssaultRoute` in map.ts); these tests
 * are the contract that the post-pass upholds.
 */

const SIZES: MapSize[] = ['small', 'medium', 'large', 'xlarge']
const TOPOLOGIES: GridTopology[] = ['square', 'hex']
const SEEDS = Array.from({ length: 25 }, (_, i) => i * 37 + 1)
/** Cycle player counts across seeds so every size sees 2..8-seat boards. */
const playerCountFor = (seed: number) => [2, 3, 4, 6, 8][seed % 5]!

const generateMap = (
  seed: number,
  mapSize: MapSize,
  playerCount: number,
  topology?: GridTopology,
  homeIslandRadius?: number,
): GameMap =>
  generateMapRaw(
    seed,
    mapSize,
    playerCount,
    homeIslandRadius ??
      GAME_SETUP.homeIslandRadiusOverrides?.[mapSize] ??
      GAME_SETUP.homeIslandRadius,
    GAME_SETUP.homeIslandRingRadiusFactor,
    topology,
  )

function ports(map: GameMap) {
  const out: { x: number; y: number }[] = []
  for (let y = 0; y < map.height; y++) {
    for (let x = 0; x < map.width; x++) {
      if (map.tiles[tileIndex(map, x, y)]!.type === 'port') out.push({ x, y })
    }
  }
  return out
}

describe('land-assault guarantee on generated maps', () => {
  for (const topology of TOPOLOGIES) {
    for (const size of SIZES) {
      it(`every capital is overland-assailable: ${size}, ${topology}, ${SEEDS.length} seeds`, () => {
        for (const seed of SEEDS) {
          const map = generateMap(seed, size, playerCountFor(seed), topology)
          const navigable = navigableWaterTiles(map, map.startPositions)
          for (const port of ports(map)) {
            expect(
              hasLandAssaultRoute(map, port, navigable),
              `seed ${seed} (${playerCountFor(seed)}p): capital at ${port.x},${port.y}`,
            ).toBe(true)
          }
        }
      })
    }
  }

  it('inland settlements appear at every size and are overland-assailable', () => {
    // Density/minStartDistance mirror @aop/content's INLAND_SETTLEMENTS.
    const tuning = { density: 0.08, buildings: ['townhall', 'barracks'], minStartDistance: 2 }
    for (const size of SIZES) {
      let total = 0
      for (const seed of SEEDS) {
        const map = generateMap(seed, size, 4)
        const { positions } = seedInlandSettlements(
          map,
          tuning,
          seedForLandContent(seed),
          map.startPositions,
          new Set(),
        )
        total += positions.length
        const navigable = navigableWaterTiles(map, map.startPositions)
        for (const p of positions) {
          expect(
            hasLandAssaultRoute(map, p, navigable),
            `seed ${seed} ${size}: settlement at ${p.x},${p.y}`,
          ).toBe(true)
        }
      }
      // D-038's "xlarge is where they appear" is superseded: every size must
      // offer inland targets across the battery, not just the largest board.
      expect(total, `${size} settlements across ${SEEDS.length} seeds`).toBeGreaterThan(0)
    }
  })

  it('repairs degenerate islands deterministically instead of shipping conquest-inert capitals', () => {
    // Radius 0 carves single-tile "islands" — a port with no land at all, the
    // worst case the guarantee can face. The repair post-pass must grow a land
    // bridge (never a retry loop) and still yield legal water starts.
    for (const topology of TOPOLOGIES) {
      for (const seed of [1, 7, 42]) {
        const map = generateMap(seed, 'small', 2, topology, 0)
        const navigable = navigableWaterTiles(map, map.startPositions)
        for (const port of ports(map)) {
          expect(hasLandAssaultRoute(map, port, navigable), `seed ${seed} ${topology}`).toBe(true)
        }
        for (const s of map.startPositions) {
          expect(isWaterTile(tileAt(map, s))).toBe(true)
          expect(navigable.has(tileIndex(map, s.x, s.y))).toBe(true)
        }
        // RNG-free repair: identical inputs yield the identical repaired board.
        expect(generateMap(seed, 'small', 2, topology, 0)).toEqual(map)
      }
    }
  })
})

describe('hasLandAssaultRoute semantics', () => {
  function seaMap(width: number, height: number): GameMap {
    const tiles: Tile[] = Array.from({ length: width * height }, () => ({
      type: 'deep' as TileType,
      island: -1,
    }))
    return { width, height, tiles, startPositions: [{ x: 0, y: 0 }] }
  }
  const set = (map: GameMap, x: number, y: number, type: TileType, island = 0) => {
    map.tiles[tileIndex(map, x, y)] = { type, island }
  }

  it('rejects a bare single-tile port island (no land at all)', () => {
    const map = seaMap(9, 9)
    set(map, 4, 4, 'port')
    expect(hasLandAssaultRoute(map, { x: 4, y: 4 })).toBe(false)
  })

  it('rejects an island whose every land tile hugs the city', () => {
    const map = seaMap(9, 9)
    set(map, 4, 4, 'port')
    set(map, 5, 4, 'land')
    set(map, 4, 5, 'land')
    expect(hasLandAssaultRoute(map, { x: 4, y: 4 })).toBe(false)
  })

  it('accepts once a land tile beyond the city rim touches navigable water', () => {
    const map = seaMap(9, 9)
    set(map, 4, 4, 'port')
    set(map, 5, 4, 'land')
    set(map, 6, 4, 'land')
    expect(hasLandAssaultRoute(map, { x: 4, y: 4 })).toBe(true)
  })

  it('ignores water a ship cannot reach: a disembark shore on a landlocked pond does not count', () => {
    // A 9x9 all-land board with two water tiles: the "ocean" at (0,0) — where
    // the ships are — and a landlocked pond at (5,5). The city sits at (1,1),
    // so the only land tiles adjacent to the ocean are within distance 1 of
    // the city (disqualified). Plenty of land beyond the city rim touches the
    // POND — but a ship can never deliver a party there.
    const map = seaMap(9, 9)
    for (let y = 0; y < 9; y++) for (let x = 0; x < 9; x++) set(map, x, y, 'land')
    set(map, 0, 0, 'deep', -1) // the ocean
    set(map, 5, 5, 'deep', -1) // the pond
    set(map, 1, 1, 'port')
    const ocean = navigableWaterTiles(map, [{ x: 0, y: 0 }])
    expect(ocean.has(tileIndex(map, 5, 5))).toBe(false)
    expect(hasLandAssaultRoute(map, { x: 1, y: 1 }, ocean)).toBe(false)
    // The identical geometry with the pond counted as navigable would pass —
    // proving navigability, not mere water adjacency, is what gates the route.
    const pondToo = navigableWaterTiles(map, [
      { x: 0, y: 0 },
      { x: 5, y: 5 },
    ])
    expect(hasLandAssaultRoute(map, { x: 1, y: 1 }, pondToo)).toBe(true)
  })
})
