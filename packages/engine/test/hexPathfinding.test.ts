import { describe, expect, it } from 'vitest'
import {
  findHexPath,
  hexPathCost,
  hexTileIndex,
  isHexPassable,
  offsetHexDistance,
  offsetHexNeighbors,
  type HexGridMap,
  type OffsetHex,
} from '../src'

/** Build a map from ASCII rows: `.` passable, `#` impassable. */
function mapOf(rows: string[]): HexGridMap {
  const width = rows[0]!.length
  const height = rows.length
  const passable = rows.flatMap((row) => [...row].map((ch) => ch === '.'))
  return { width, height, passable }
}

/** Independent ground truth: BFS shortest step count, or null if unreachable. */
function bfsCost(map: HexGridMap, from: OffsetHex, to: OffsetHex): number | null {
  if (!isHexPassable(map, from) || !isHexPassable(map, to)) return null
  const dist = new Int32Array(map.width * map.height).fill(-1)
  dist[hexTileIndex(map, from)] = 0
  const queue: OffsetHex[] = [from]
  for (let i = 0; i < queue.length; i++) {
    const cur = queue[i]!
    const d = dist[hexTileIndex(map, cur)]!
    if (cur.col === to.col && cur.row === to.row) return d
    for (const n of offsetHexNeighbors(cur, map.width, map.height)) {
      const idx = hexTileIndex(map, n)
      if (dist[idx] !== -1 || map.passable[idx] !== true) continue
      dist[idx] = d + 1
      queue.push(n)
    }
  }
  return null
}

/** Assert a path is well-formed: endpoints match, steps contiguous, all passable. */
function expectValidPath(map: HexGridMap, path: OffsetHex[], from: OffsetHex, to: OffsetHex) {
  expect(path[0]).toEqual(from)
  expect(path[path.length - 1]).toEqual(to)
  for (const hex of path) expect(isHexPassable(map, hex)).toBe(true)
  for (let i = 1; i < path.length; i++) {
    expect(offsetHexDistance(path[i - 1]!, path[i]!)).toBe(1)
  }
}

const OPEN_7 = mapOf(['.......', '.......', '.......', '.......', '.......', '.......', '.......'])

const WALLED = mapOf([
  '........',
  '........',
  '..####..',
  '..#..#..',
  '..#..#..',
  '..####..',
  '........',
  '........',
])

describe('findHexPath', () => {
  it('walks a straight line on open terrain: cost equals hex distance', () => {
    const from = { col: 0, row: 0 }
    const to = { col: 5, row: 4 }
    const path = findHexPath(OPEN_7, from, to)!
    expectValidPath(OPEN_7, path, from, to)
    expect(path.length - 1).toBe(offsetHexDistance(from, to))
  })

  it('returns [from] when from equals to', () => {
    expect(findHexPath(OPEN_7, { col: 3, row: 3 }, { col: 3, row: 3 })).toEqual([
      { col: 3, row: 3 },
    ])
  })

  it('returns null when either endpoint is impassable or out of bounds', () => {
    expect(findHexPath(WALLED, { col: 2, row: 2 }, { col: 0, row: 0 })).toBeNull()
    expect(findHexPath(WALLED, { col: 0, row: 0 }, { col: 3, row: 2 })).toBeNull()
    expect(findHexPath(OPEN_7, { col: -1, row: 0 }, { col: 3, row: 3 })).toBeNull()
    expect(findHexPath(OPEN_7, { col: 0, row: 0 }, { col: 7, row: 0 })).toBeNull()
  })

  it('returns null for a target sealed inside a wall', () => {
    expect(findHexPath(WALLED, { col: 0, row: 0 }, { col: 3, row: 3 })).toBeNull()
    expect(hexPathCost(WALLED, { col: 0, row: 0 }, { col: 4, row: 4 })).toBeNull()
  })

  it('detours around obstacles and the detour is longer than the crow-flies distance', () => {
    const map = mapOf(['........', '..####..', '..####..', '..####..', '........'])
    const from = { col: 0, row: 2 }
    const to = { col: 7, row: 2 }
    const path = findHexPath(map, from, to)!
    expectValidPath(map, path, from, to)
    expect(path.length - 1).toBeGreaterThan(offsetHexDistance(from, to))
    expect(path.length - 1).toBe(bfsCost(map, from, to))
  })

  it('matches BFS ground truth for every reachable pair on an obstacle map', () => {
    const map = WALLED
    const tiles: OffsetHex[] = []
    for (let row = 0; row < map.height; row++) {
      for (let col = 0; col < map.width; col++) tiles.push({ col, row })
    }
    for (const from of tiles) {
      for (const to of tiles) {
        const expected = bfsCost(map, from, to)
        expect(hexPathCost(map, from, to)).toBe(expected)
      }
    }
  })

  it('is deterministic: repeated queries return the byte-identical path', () => {
    const from = { col: 0, row: 7 }
    const to = { col: 7, row: 0 }
    const first = findHexPath(WALLED, from, to)
    for (let i = 0; i < 5; i++) expect(findHexPath(WALLED, from, to)).toEqual(first)
  })
})
