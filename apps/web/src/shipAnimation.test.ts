import { describe, expect, it } from 'vitest'
import { easeInOutCubic, pathArcLength, pathPointAt, shipAnimDurationMs } from './shipAnimation'

describe('easeInOutCubic', () => {
  it('anchors the endpoints and is monotonic increasing', () => {
    expect(easeInOutCubic(0)).toBe(0)
    expect(easeInOutCubic(1)).toBe(1)
    let prev = -Infinity
    for (let t = 0; t <= 1; t += 0.05) {
      const eased = easeInOutCubic(t)
      expect(eased).toBeGreaterThanOrEqual(prev)
      prev = eased
    }
  })

  it('clamps out-of-range input', () => {
    expect(easeInOutCubic(-1)).toBe(0)
    expect(easeInOutCubic(2)).toBe(1)
  })
})

describe('pathArcLength', () => {
  it('is zero for a single-tile path', () => {
    expect(pathArcLength([{ x: 3, y: 3 }])).toBe(0)
  })

  it('sums orthogonal steps as 1 each', () => {
    const path = [
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: 2, y: 0 },
    ]
    expect(pathArcLength(path)).toBe(2)
  })

  it('weights a diagonal step as sqrt(2)', () => {
    const path = [
      { x: 0, y: 0 },
      { x: 1, y: 1 },
    ]
    expect(pathArcLength(path)).toBeCloseTo(Math.SQRT2)
  })
})

describe('shipAnimDurationMs', () => {
  it('floors very short paths to a visible minimum', () => {
    const path = [
      { x: 0, y: 0 },
      { x: 1, y: 0 },
    ]
    expect(shipAnimDurationMs(path)).toBeGreaterThanOrEqual(160)
  })

  it('caps very long paths so a voyage never drags on', () => {
    const path = Array.from({ length: 50 }, (_, i) => ({ x: i, y: 0 }))
    expect(shipAnimDurationMs(path)).toBeLessThanOrEqual(1400)
  })

  it('scales up with path length between the floor and cap', () => {
    const short = [
      { x: 0, y: 0 },
      { x: 2, y: 0 },
    ]
    const long = Array.from({ length: 6 }, (_, i) => ({ x: i, y: 0 }))
    expect(shipAnimDurationMs(long)).toBeGreaterThan(shipAnimDurationMs(short))
  })
})

describe('pathPointAt', () => {
  const path = [
    { x: 0, y: 0 },
    { x: 1, y: 0 },
    { x: 2, y: 0 },
  ]

  it('returns the origin tile at t=0 and the destination tile at t=1', () => {
    expect(pathPointAt(path, 0)).toEqual({ x: 0, y: 0 })
    expect(pathPointAt(path, 1)).toEqual({ x: 2, y: 0 })
  })

  it('interpolates the midpoint at t=0.5 for a uniform-speed path', () => {
    const mid = pathPointAt(path, 0.5)
    expect(mid.x).toBeCloseTo(1)
    expect(mid.y).toBeCloseTo(0)
  })

  it('holds a single-point path fixed for any t', () => {
    const single = [{ x: 4, y: 5 }]
    expect(pathPointAt(single, 0)).toEqual({ x: 4, y: 5 })
    expect(pathPointAt(single, 0.5)).toEqual({ x: 4, y: 5 })
    expect(pathPointAt(single, 1)).toEqual({ x: 4, y: 5 })
  })

  it('clamps out-of-range t to the path endpoints', () => {
    expect(pathPointAt(path, -1)).toEqual({ x: 0, y: 0 })
    expect(pathPointAt(path, 2)).toEqual({ x: 2, y: 0 })
  })

  it('travels diagonal and orthogonal segments at constant speed', () => {
    // A diagonal step (sqrt(2)) followed by an orthogonal step (1): arc length
    // sqrt(2) + 1. At the fraction where arc length traveled equals the diagonal
    // segment's own length, the point should land exactly on the corner tile.
    const mixed = [
      { x: 0, y: 0 },
      { x: 1, y: 1 },
      { x: 2, y: 1 },
    ]
    const total = Math.SQRT2 + 1
    const cornerT = Math.SQRT2 / total
    const corner = pathPointAt(mixed, cornerT)
    expect(corner.x).toBeCloseTo(1)
    expect(corner.y).toBeCloseTo(1)
  })
})
