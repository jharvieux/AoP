import { describe, expect, it } from 'vitest'
import { generateMap, mapNeighbors, mapTopology } from '@aop/engine'
import { neighborAcrossEdge, smoothLoop, traceRegionLoops } from './paintedWorld'

const TILE = 32

describe('neighborAcrossEdge', () => {
  it('square: the four edges map exactly to the four orthogonal neighbors', () => {
    const found = new Set<string>()
    for (let edge = 0; edge < 4; edge++) {
      const n = neighborAcrossEdge('square', 5, 7, edge, TILE)
      found.add(`${n.x},${n.y}`)
    }
    expect(found).toEqual(new Set(['5,6', '6,7', '5,8', '4,7']))
  })

  it('hex: the six edges map exactly to the six engine hex neighbors', () => {
    // The engine is the adjacency authority — the rendered outline must agree
    // with mapNeighbors or coastlines would separate land from its own
    // reachable water.
    const map = generateMap(11, 'small', 2, 3, 0.5, 'hex')
    expect(mapTopology(map)).toBe('hex')
    const engineNeighbors = new Set(mapNeighbors(map, { x: 5, y: 7 }).map((c) => `${c.x},${c.y}`))
    const traced = new Set<string>()
    for (let edge = 0; edge < 6; edge++) {
      const n = neighborAcrossEdge('hex', 5, 7, edge, TILE)
      traced.add(`${n.x},${n.y}`)
    }
    expect(traced).toEqual(engineNeighbors)
  })
})

describe('traceRegionLoops', () => {
  it('a single square cell yields one closed 4-corner loop', () => {
    const loops = traceRegionLoops('square', 8, 8, TILE, (x, y) => x === 2 && y === 3)
    expect(loops).toHaveLength(1)
    expect(loops[0]!.hole).toBe(false)
    expect(loops[0]!.points).toHaveLength(8)
  })

  it('a single hex cell yields one closed 6-corner loop', () => {
    const loops = traceRegionLoops('hex', 8, 8, TILE, (x, y) => x === 2 && y === 3)
    expect(loops).toHaveLength(1)
    expect(loops[0]!.points).toHaveLength(12)
  })

  it('two adjacent cells merge into one loop with the shared edge removed', () => {
    const loops = traceRegionLoops('square', 8, 8, TILE, (x, y) => y === 3 && (x === 2 || x === 3))
    expect(loops).toHaveLength(1)
    // 2 cells × 4 edges − 2 shared = 6 boundary edges.
    expect(loops[0]!.points).toHaveLength(12)
  })

  it('a 3×3 ring of cells yields an outer loop and a hole', () => {
    const inRing = (x: number, y: number) =>
      x >= 1 && x <= 3 && y >= 1 && y <= 3 && !(x === 2 && y === 2)
    const loops = traceRegionLoops('square', 8, 8, TILE, inRing)
    expect(loops).toHaveLength(2)
    const holes = loops.filter((l) => l.hole)
    expect(holes).toHaveLength(1)
    // The hole is the inner cell's 4-corner boundary.
    expect(holes[0]!.points).toHaveLength(8)
  })

  it('map-edge cells contribute their outer edges (region flush to the border)', () => {
    const loops = traceRegionLoops('square', 4, 4, TILE, (x, y) => x === 0 && y === 0)
    expect(loops).toHaveLength(1)
    expect(loops[0]!.points).toHaveLength(8)
  })

  it('is deterministic: identical inputs produce identical loops', () => {
    const region = (x: number, y: number) => (x * 7 + y * 13) % 5 < 2
    const a = traceRegionLoops('hex', 10, 10, TILE, region)
    const b = traceRegionLoops('hex', 10, 10, TILE, region)
    expect(a).toEqual(b)
  })
})

describe('smoothLoop', () => {
  it('doubles the point count per iteration and stays closed', () => {
    const square = [0, 0, 32, 0, 32, 32, 0, 32]
    const once = smoothLoop(square, 1)
    expect(once).toHaveLength(16)
    const twice = smoothLoop(square, 2)
    expect(twice).toHaveLength(32)
  })

  it('keeps every smoothed point inside the original bounding box', () => {
    const square = [0, 0, 32, 0, 32, 32, 0, 32]
    const smoothed = smoothLoop(square, 2)
    for (let i = 0; i < smoothed.length; i += 2) {
      expect(smoothed[i]!).toBeGreaterThanOrEqual(0)
      expect(smoothed[i]!).toBeLessThanOrEqual(32)
      expect(smoothed[i + 1]!).toBeGreaterThanOrEqual(0)
      expect(smoothed[i + 1]!).toBeLessThanOrEqual(32)
    }
  })
})
