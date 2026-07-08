import { HEX_PROTO_HEIGHT, HEX_PROTO_TERRAIN, HEX_PROTO_WIDTH } from '@aop/content'
import {
  findHexPath,
  hexTileIndex,
  isHexPassable,
  offsetHexDistance,
  offsetHexNeighbors,
  type HexGridMap,
  type OffsetHex,
} from '@aop/engine'
import { describe, expect, it } from 'vitest'

/**
 * Integration test for the hex-grid prototype (#348, Phase 1): engine hex
 * pathfinding over the disposable @aop/content test map. Lives in the web
 * package because the engine never imports @aop/content — callers marry the
 * two, exactly as they will for real content.
 */

const HEX_PROTO_MAP: HexGridMap = {
  width: HEX_PROTO_WIDTH,
  height: HEX_PROTO_HEIGHT,
  passable: HEX_PROTO_TERRAIN.map((t) => t === 'land'),
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

describe('hex prototype map', () => {
  it('is 15×15 with all three terrain types present', () => {
    expect(HEX_PROTO_TERRAIN).toHaveLength(15 * 15)
    const kinds = new Set(HEX_PROTO_TERRAIN)
    expect(kinds).toEqual(new Set(['land', 'water', 'mountain']))
  })

  it('routes (0,0) -> (10,5) optimally around the lake and the mountain ridge', () => {
    const from = { col: 0, row: 0 }
    const to = { col: 10, row: 5 }
    const path = findHexPath(HEX_PROTO_MAP, from, to)

    expect(path).not.toBeNull()
    expect(path![0]).toEqual(from)
    expect(path![path!.length - 1]).toEqual(to)
    // Contiguous single-hex steps over land only.
    for (const hex of path!) {
      expect(HEX_PROTO_TERRAIN[hexTileIndex(HEX_PROTO_MAP, hex)]).toBe('land')
    }
    for (let i = 1; i < path!.length; i++) {
      expect(offsetHexDistance(path![i - 1]!, path![i]!)).toBe(1)
    }
    // Optimal: matches independent BFS ground truth; longer than crow-flies
    // (13), proving the obstacles genuinely forced a detour.
    const cost = path!.length - 1
    expect(offsetHexDistance(from, to)).toBe(13)
    expect(cost).toBe(bfsCost(HEX_PROTO_MAP, from, to))
    expect(cost).toBe(15)
  })

  it('matches BFS ground truth across a spread of map-wide queries', () => {
    const land: OffsetHex[] = []
    for (let row = 0; row < HEX_PROTO_HEIGHT; row++) {
      for (let col = 0; col < HEX_PROTO_WIDTH; col++) {
        if (HEX_PROTO_TERRAIN[row * HEX_PROTO_WIDTH + col] === 'land') land.push({ col, row })
      }
    }
    for (let i = 0; i < 100; i++) {
      const from = land[(i * 37) % land.length]!
      const to = land[(i * 89 + 53) % land.length]!
      const path = findHexPath(HEX_PROTO_MAP, from, to)
      const expected = bfsCost(HEX_PROTO_MAP, from, to)
      expect(path === null ? null : path.length - 1).toBe(expected)
    }
  })

  it('pathfinding is deterministic across repeated queries', () => {
    const from = { col: 0, row: 0 }
    const to = { col: 14, row: 14 }
    const first = findHexPath(HEX_PROTO_MAP, from, to)
    for (let i = 0; i < 5; i++) expect(findHexPath(HEX_PROTO_MAP, from, to)).toEqual(first)
  })
})
