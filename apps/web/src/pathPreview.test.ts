import { describe, expect, it } from 'vitest'
import { findPath, type GameMap, type Tile } from '@aop/engine'
import { arrowheadAngle, pathToDotSegments, turnBoundaryIndices } from './pathPreview'

function squareMap(size: number): GameMap {
  const tiles: Tile[] = Array.from({ length: size * size }, () => ({ type: 'deep', island: -1 }))
  return { width: size, height: size, tiles, startPositions: [] }
}

function hexMap(size: number): GameMap {
  return { ...squareMap(size), topology: 'hex' }
}

describe('pathToDotSegments', () => {
  it('square: one segment per step, flagged this-turn up to movementPoints', () => {
    const map = squareMap(10)
    const path = findPath(map, { x: 0, y: 0 }, { x: 6, y: 0 })!
    expect(path.length - 1).toBe(6) // 6 steps
    const segments = pathToDotSegments(path, 3, 5)
    expect(segments).toHaveLength(6)
    expect(segments.map((s) => s.index)).toEqual([1, 2, 3, 4, 5, 6])
    expect(segments.map((s) => s.thisTurn)).toEqual([true, true, true, false, false, false])
  })

  it('hex: one segment per step, same this-turn cutoff semantics', () => {
    const map = hexMap(12)
    const path = findPath(map, { x: 0, y: 0 }, { x: 5, y: 0 })!
    const segments = pathToDotSegments(path, 2, 5)
    expect(segments.every((s, i) => s.index === i + 1)).toBe(true)
    expect(segments.filter((s) => s.thisTurn)).toHaveLength(2)
  })

  it('a path of just the start tile (already there) yields no segments', () => {
    expect(pathToDotSegments([{ x: 3, y: 3 }], 5, 5)).toEqual([])
  })

  it('the whole path fits this turn: every segment is this-turn', () => {
    const map = squareMap(10)
    const path = findPath(map, { x: 0, y: 0 }, { x: 3, y: 0 })!
    const segments = pathToDotSegments(path, 5, 5)
    expect(segments.every((s) => s.thisTurn)).toBe(true)
  })
})

describe('turnBoundaryIndices', () => {
  it('places the first boundary at movementPoints, then every maxMovementPoints after', () => {
    // A 12-step path, 3 MP left this turn, 5 MP/turn after refresh:
    // this turn covers steps 1-3, next turn 4-8, the one after 9-12 (+ a 13th
    // boundary that would be out of range and is correctly omitted).
    expect(turnBoundaryIndices(13, 3, 5)).toEqual([3, 8])
  })

  it('no boundaries when the whole path completes this turn', () => {
    expect(turnBoundaryIndices(4, 5, 5)).toEqual([])
  })

  it('zero movement points left: the first boundary is the fresh-turn refresh amount', () => {
    expect(turnBoundaryIndices(8, 0, 5)).toEqual([5])
  })

  it('a same-tile or single-tile path has no boundaries', () => {
    expect(turnBoundaryIndices(1, 5, 5)).toEqual([])
    expect(turnBoundaryIndices(0, 5, 5)).toEqual([])
  })
})

describe('arrowheadAngle', () => {
  it('points right (0 rad) when travelling in +x', () => {
    expect(arrowheadAngle({ x: 0, y: 0 }, { x: 10, y: 0 })).toBeCloseTo(0)
  })

  it('points down (+π/2 rad, screen space) when travelling in +y', () => {
    expect(arrowheadAngle({ x: 0, y: 0 }, { x: 0, y: 10 })).toBeCloseTo(Math.PI / 2)
  })

  it('points left (±π rad) when travelling in -x', () => {
    expect(Math.abs(arrowheadAngle({ x: 10, y: 0 }, { x: 0, y: 0 }))).toBeCloseTo(Math.PI)
  })
})
