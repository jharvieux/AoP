import { describe, expect, it } from 'vitest'
import type { Coord } from '@aop/shared'
import {
  pathCost,
  reachableTiles,
  tileAt,
  tileIndex,
  isWaterTile,
  type GameMap,
  type GridTopology,
  type Tile,
} from '../src'

/**
 * Build a GameMap from ASCII rows for `reachableTiles` (#371): `.` = deep water,
 * `#` = land. No start positions needed — these tests only exercise the flood.
 */
function mapOf(rows: string[], topology?: GridTopology): GameMap {
  const width = rows[0]!.length
  const height = rows.length
  const tiles: Tile[] = rows.flatMap((row) =>
    [...row].map((ch): Tile =>
      ch === '#' ? { type: 'land', island: 0 } : { type: 'deep', island: -1 },
    ),
  )
  const map: GameMap = { width, height, tiles, startPositions: [] }
  if (topology === 'hex') map.topology = 'hex'
  return map
}

/** Ground truth: every water tile except `from` whose path cost is in [1, mp]. */
function bruteReachable(map: GameMap, from: Coord, mp: number): Coord[] {
  const out: Coord[] = []
  for (let y = 0; y < map.height; y++) {
    for (let x = 0; x < map.width; x++) {
      if (x === from.x && y === from.y) continue
      if (!isWaterTile(tileAt(map, { x, y }))) continue
      const cost = pathCost(map, from, { x, y })
      if (cost !== null && cost >= 1 && cost <= mp) out.push({ x, y })
    }
  }
  return out.sort((a, b) => tileIndex(map, a.x, a.y) - tileIndex(map, b.x, b.y))
}

const OPEN = mapOf(['.......', '.......', '.......', '.......', '.......', '.......', '.......'])

// Two open seas split by a solid land wall — nothing crosses from one to the other.
const TWO_BASINS = mapOf([
  '...#...',
  '...#...',
  '...#...',
  '...#...',
  '...#...',
  '...#...',
  '...#...',
])

describe('reachableTiles (#371)', () => {
  it('returns an empty array when movementPoints is 0', () => {
    expect(reachableTiles(OPEN, { x: 3, y: 3 }, 0)).toEqual([])
  })

  it('returns an empty array from a non-water origin', () => {
    expect(reachableTiles(TWO_BASINS, { x: 3, y: 3 }, 5)).toEqual([])
  })

  it('never includes the origin tile itself', () => {
    const from = { x: 3, y: 3 }
    const tiles = reachableTiles(OPEN, from, 4)
    expect(tiles.some((t) => t.x === from.x && t.y === from.y)).toBe(false)
  })

  it('every returned tile has a path cost between 1 and movementPoints (square)', () => {
    const from = { x: 3, y: 3 }
    const mp = 3
    for (const tile of reachableTiles(OPEN, from, mp)) {
      const cost = pathCost(OPEN, from, tile)
      expect(cost).not.toBeNull()
      expect(cost!).toBeGreaterThanOrEqual(1)
      expect(cost!).toBeLessThanOrEqual(mp)
    }
  })

  it('returns exactly the in-range water tiles: square topology', () => {
    for (const mp of [1, 2, 3, 5]) {
      const from = { x: 3, y: 3 }
      expect(reachableTiles(OPEN, from, mp)).toEqual(bruteReachable(OPEN, from, mp))
    }
  })

  it('returns exactly the in-range water tiles: hex topology', () => {
    const openHex = mapOf(
      ['.......', '.......', '.......', '.......', '.......', '.......', '.......'],
      'hex',
    )
    for (const mp of [1, 2, 3, 5]) {
      const from = { x: 3, y: 3 }
      expect(reachableTiles(openHex, from, mp)).toEqual(bruteReachable(openHex, from, mp))
    }
  })

  it('respects water basin boundaries: never crosses a land wall', () => {
    const from = { x: 1, y: 3 } // left basin
    const tiles = reachableTiles(TWO_BASINS, from, 99)
    // With ample movement it floods the whole left basin (columns 0-2) but never
    // reaches the right basin (columns 4-6) across the land wall at column 3.
    expect(tiles.length).toBeGreaterThan(0)
    for (const t of tiles) expect(t.x).toBeLessThan(3)
    expect(tiles).toEqual(bruteReachable(TWO_BASINS, from, 99))
  })

  it('is deterministic: repeated queries return byte-identical arrays', () => {
    const from = { x: 0, y: 0 }
    const first = reachableTiles(OPEN, from, 4)
    for (let i = 0; i < 5; i++) expect(reachableTiles(OPEN, from, 4)).toEqual(first)
  })

  it('is sorted by tile index', () => {
    const tiles = reachableTiles(OPEN, { x: 3, y: 3 }, 5)
    for (let i = 1; i < tiles.length; i++) {
      expect(tileIndex(OPEN, tiles[i]!.x, tiles[i]!.y)).toBeGreaterThan(
        tileIndex(OPEN, tiles[i - 1]!.x, tiles[i - 1]!.y),
      )
    }
  })
})
