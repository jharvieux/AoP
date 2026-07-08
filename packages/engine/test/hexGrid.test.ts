import { describe, expect, it } from 'vitest'
import {
  cartToHex,
  cube,
  cubeAdd,
  CUBE_DIRECTIONS,
  cubeDistance,
  cubeEquals,
  cubeNeighbor,
  cubeNeighbors,
  cubeRing,
  cubeRound,
  cubeScale,
  cubeToOffset,
  hexDistance,
  hexToCart,
  offsetHexDistance,
  offsetHexNeighbors,
  offsetToCube,
  type CubeHex,
  type OffsetHex,
} from '../src'

const isValidCube = (h: CubeHex) => h.q + h.r + h.s === 0

/** Every offset coord of a `width`×`height` board. */
function allOffsets(width: number, height: number): OffsetHex[] {
  const out: OffsetHex[] = []
  for (let row = 0; row < height; row++) {
    for (let col = 0; col < width; col++) out.push({ col, row })
  }
  return out
}

describe('cube coordinates', () => {
  it('cube() derives s so the q+r+s=0 invariant always holds', () => {
    for (let q = -5; q <= 5; q++) {
      for (let r = -5; r <= 5; r++) {
        expect(isValidCube(cube(q, r))).toBe(true)
      }
    }
  })

  it('the six directions are distinct unit vectors satisfying the invariant', () => {
    expect(CUBE_DIRECTIONS).toHaveLength(6)
    const seen = new Set(CUBE_DIRECTIONS.map((d) => `${d.q},${d.r}`))
    expect(seen.size).toBe(6)
    for (const d of CUBE_DIRECTIONS) {
      expect(isValidCube(d)).toBe(true)
      expect(cubeDistance(cube(0, 0), d)).toBe(1)
    }
  })

  it('cubeAdd and cubeScale preserve the invariant', () => {
    const a = cube(3, -2)
    const b = cube(-1, 4)
    expect(cubeAdd(a, b)).toEqual(cube(2, 2))
    expect(cubeScale(a, 3)).toEqual(cube(9, -6))
  })

  it('cubeEquals compares all three components', () => {
    expect(cubeEquals(cube(2, -1), cube(2, -1))).toBe(true)
    expect(cubeEquals(cube(2, -1), cube(2, 0))).toBe(false)
    expect(cubeEquals(cube(2, -1), cube(1, -1))).toBe(false)
  })

  it('every hex has exactly six neighbors, all at distance 1', () => {
    const center = cube(4, -7)
    const neighbors = cubeNeighbors(center)
    expect(neighbors).toHaveLength(6)
    const seen = new Set(neighbors.map((n) => `${n.q},${n.r}`))
    expect(seen.size).toBe(6)
    for (let dir = 0; dir < 6; dir++) {
      const n = cubeNeighbor(center, dir)
      expect(isValidCube(n)).toBe(true)
      expect(cubeDistance(center, n)).toBe(1)
      expect(n).toEqual(neighbors[dir])
    }
  })
})

describe('cubeDistance', () => {
  it('is zero on identity, symmetric, and satisfies the triangle inequality', () => {
    const points = [cube(0, 0), cube(3, -1), cube(-2, 5), cube(4, 4), cube(-3, -3)]
    for (const a of points) {
      expect(cubeDistance(a, a)).toBe(0)
      for (const b of points) {
        expect(cubeDistance(a, b)).toBe(cubeDistance(b, a))
        for (const c of points) {
          expect(cubeDistance(a, c)).toBeLessThanOrEqual(cubeDistance(a, b) + cubeDistance(b, c))
        }
      }
    }
  })

  it('equals the minimum step count found by BFS over an open grid', () => {
    // Ground truth: breadth-first flood from the origin, 5 rings out.
    const dist = new Map<string, number>()
    const key = (h: CubeHex) => `${h.q},${h.r}`
    let frontier = [cube(0, 0)]
    dist.set(key(frontier[0]!), 0)
    for (let d = 1; d <= 5; d++) {
      const next: CubeHex[] = []
      for (const h of frontier) {
        for (const n of cubeNeighbors(h)) {
          if (!dist.has(key(n))) {
            dist.set(key(n), d)
            next.push(n)
          }
        }
      }
      frontier = next
    }
    for (const [k, d] of dist) {
      const [q, r] = k.split(',').map(Number)
      expect(cubeDistance(cube(0, 0), cube(q!, r!))).toBe(d)
    }
  })

  it('has no diagonal bias: rings of equal radius are equidistant in every direction', () => {
    for (const h of cubeRing(cube(0, 0), 4)) {
      expect(cubeDistance(cube(0, 0), h)).toBe(4)
    }
  })
})

describe('cubeRing', () => {
  it('radius 0 is the center itself', () => {
    expect(cubeRing(cube(2, 3), 0)).toEqual([cube(2, 3)])
  })

  it('radius r yields exactly 6r distinct hexes, all at distance r', () => {
    const center = cube(-1, 2)
    for (const radius of [1, 2, 3]) {
      const ring = cubeRing(center, radius)
      expect(ring).toHaveLength(6 * radius)
      const seen = new Set(ring.map((h) => `${h.q},${h.r}`))
      expect(seen.size).toBe(ring.length)
      for (const h of ring) {
        expect(isValidCube(h)).toBe(true)
        expect(cubeDistance(center, h)).toBe(radius)
      }
    }
  })

  it('rejects negative radii', () => {
    expect(() => cubeRing(cube(0, 0), -1)).toThrow()
  })
})

describe('cubeRound', () => {
  it('is the identity on integer hexes', () => {
    for (let q = -3; q <= 3; q++) {
      for (let r = -3; r <= 3; r++) {
        expect(cubeRound(q, r, -q - r)).toEqual(cube(q, r))
      }
    }
  })

  it('repairs each axis when it carries the largest rounding error', () => {
    // dq largest: q drifts furthest from integer.
    expect(isValidCube(cubeRound(0.6, 1.1, -1.7))).toBe(true)
    expect(cubeRound(0.6, 1.1, -1.7)).toEqual(cube(1, 1))
    // dr largest.
    expect(cubeRound(1.1, 0.6, -1.7)).toEqual(cube(1, 1))
    // ds largest (else branch).
    expect(cubeRound(1.1, -1.7, 0.6)).toEqual({ q: 1, r: -2, s: 1 })
  })

  it('small perturbations of a hex centre round back to that hex', () => {
    const h = cube(3, -2)
    expect(cubeRound(h.q + 0.2, h.r - 0.15, h.s - 0.05)).toEqual(h)
  })
})

describe('offset <-> cube conversion', () => {
  it('round-trips across a full 15×15 board (both row parities)', () => {
    for (const o of allOffsets(15, 15)) {
      const c = offsetToCube(o)
      expect(isValidCube(c)).toBe(true)
      expect(cubeToOffset(c)).toEqual(o)
    }
  })

  it('round-trips cube -> offset -> cube including negative rows', () => {
    for (let q = -4; q <= 4; q++) {
      for (let r = -4; r <= 4; r++) {
        const c = cube(q, r)
        expect(offsetToCube(cubeToOffset(c))).toEqual(c)
      }
    }
  })

  it('offsetHexDistance agrees with the battle board hexDistance convention', () => {
    // Both modules use pointy-top odd-r offsets; distances must be identical.
    const coords = allOffsets(9, 9)
    for (const a of coords) {
      for (const b of coords) {
        expect(offsetHexDistance(a, b)).toBe(hexDistance(a, b))
      }
    }
  })
})

describe('cartesian <-> hex conversion', () => {
  it('cartToHex inverts hexToCart exactly on hex centres', () => {
    for (let q = -6; q <= 6; q++) {
      for (let r = -6; r <= 6; r++) {
        expect(cartToHex(hexToCart(cube(q, r)))).toEqual(cube(q, r))
      }
    }
  })

  it('points perturbed from a centre still resolve to that hex', () => {
    const h = cube(2, -3)
    const c = hexToCart(h)
    expect(cartToHex({ x: c.x + 0.3, y: c.y - 0.3 })).toEqual(h)
    expect(cartToHex({ x: c.x - 0.3, y: c.y + 0.3 })).toEqual(h)
  })

  it('adjacent hexes land on distinct cartesian centres a constant gap apart', () => {
    const origin = hexToCart(cube(0, 0))
    for (const d of CUBE_DIRECTIONS) {
      const p = hexToCart(d)
      const gap = Math.hypot(p.x - origin.x, p.y - origin.y)
      expect(gap).toBeCloseTo(Math.sqrt(3), 10) // pointy-top size-1 hex pitch
    }
  })
})

describe('offsetHexNeighbors', () => {
  it('interior hexes have six neighbors, all in bounds at distance 1', () => {
    for (const center of [
      { col: 5, row: 4 },
      { col: 5, row: 5 },
    ]) {
      const neighbors = offsetHexNeighbors(center, 15, 15)
      expect(neighbors).toHaveLength(6)
      for (const n of neighbors) {
        expect(n.col).toBeGreaterThanOrEqual(0)
        expect(n.row).toBeGreaterThanOrEqual(0)
        expect(n.col).toBeLessThan(15)
        expect(n.row).toBeLessThan(15)
        expect(offsetHexDistance(center, n)).toBe(1)
      }
    }
  })

  it('edge and corner hexes are clipped to the board', () => {
    expect(offsetHexNeighbors({ col: 0, row: 0 }, 15, 15).length).toBeLessThan(6)
    for (const o of allOffsets(15, 15)) {
      for (const n of offsetHexNeighbors(o, 15, 15)) {
        expect(n.col >= 0 && n.col < 15 && n.row >= 0 && n.row < 15).toBe(true)
      }
    }
  })
})
