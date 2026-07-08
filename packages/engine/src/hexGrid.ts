/**
 * Cube-coordinate hex math for the world-map hex-grid prototype (#348, Phase 1).
 *
 * PROTOTYPE — additive and isolated. Nothing in GameState, the reducer, or the
 * square-grid world map (`map.ts` / `pathfinding.ts`) touches this module. The
 * existing `hex.ts` serves the tactical battle board with odd-r offset math; this
 * module is cube-first (per the evaluation doc) because cube coordinates make
 * distance, rings, and rotation trivial. If the conversion is approved, the two
 * modules unify; if it is rejected, this file is deleted wholesale.
 *
 * Coordinate systems:
 * - **Cube** `{ q, r, s }` with the invariant `q + r + s === 0`. Canonical form
 *   for all hex arithmetic. Integer for on-grid hexes.
 * - **Offset** (odd-r, pointy-top) `{ col, row }` — rectangular storage
 *   addressing, matching the battle board's convention so a flat row-major
 *   array serializes a rectangular hex map.
 * - **Cartesian** `{ x, y }` — pixel space for a pointy-top hex of size 1
 *   (centre-to-corner). Float math lives ONLY at this rendering/input boundary;
 *   it feeds integer rounding and never engine state, so determinism holds.
 */

export interface CubeHex {
  q: number
  r: number
  s: number
}

/** Odd-r offset address on a rectangular hex board (odd rows shove right). */
export interface OffsetHex {
  col: number
  row: number
}

export interface CartPoint {
  x: number
  y: number
}

/** Construct a cube hex from axial (q, r); s is derived to keep q+r+s = 0. */
export function cube(q: number, r: number): CubeHex {
  return { q, r, s: -q - r }
}

export function cubeEquals(a: CubeHex, b: CubeHex): boolean {
  return a.q === b.q && a.r === b.r && a.s === b.s
}

/**
 * The six unit direction vectors, pointy-top, starting east and winding
 * counter-clockwise. Fixed order = deterministic neighbor iteration.
 */
export const CUBE_DIRECTIONS: readonly CubeHex[] = [
  { q: 1, r: 0, s: -1 },
  { q: 1, r: -1, s: 0 },
  { q: 0, r: -1, s: 1 },
  { q: -1, r: 0, s: 1 },
  { q: -1, r: 1, s: 0 },
  { q: 0, r: 1, s: -1 },
]

export function cubeAdd(a: CubeHex, b: CubeHex): CubeHex {
  return { q: a.q + b.q, r: a.r + b.r, s: a.s + b.s }
}

export function cubeScale(a: CubeHex, k: number): CubeHex {
  return { q: a.q * k, r: a.r * k, s: a.s * k }
}

/** The neighbor one step in direction `dir` (index into {@link CUBE_DIRECTIONS}). */
export function cubeNeighbor(hex: CubeHex, dir: number): CubeHex {
  return cubeAdd(hex, CUBE_DIRECTIONS[dir]!)
}

/** All six neighbors, in {@link CUBE_DIRECTIONS} order. */
export function cubeNeighbors(hex: CubeHex): CubeHex[] {
  return CUBE_DIRECTIONS.map((d) => cubeAdd(hex, d))
}

/** True hex distance — the minimum number of single-hex steps between a and b. */
export function cubeDistance(a: CubeHex, b: CubeHex): number {
  return (Math.abs(a.q - b.q) + Math.abs(a.r - b.r) + Math.abs(a.s - b.s)) / 2
}

/**
 * The ring of hexes exactly `radius` steps from `center`, walked in a fixed
 * deterministic order (start `radius` steps in direction 4, wind around).
 * Radius 0 is the center itself.
 */
export function cubeRing(center: CubeHex, radius: number): CubeHex[] {
  if (radius < 0) throw new Error(`ring radius must be >= 0, got ${radius}`)
  if (radius === 0) return [{ ...center }]
  const out: CubeHex[] = []
  let hex = cubeAdd(center, cubeScale(CUBE_DIRECTIONS[4]!, radius))
  for (let side = 0; side < 6; side++) {
    for (let step = 0; step < radius; step++) {
      out.push(hex)
      hex = cubeNeighbor(hex, side)
    }
  }
  return out
}

/** Round fractional cube coordinates to the nearest on-grid hex (redblobgames). */
export function cubeRound(q: number, r: number, s: number): CubeHex {
  let rq = Math.round(q)
  let rr = Math.round(r)
  let rs = Math.round(s)
  const dq = Math.abs(rq - q)
  const dr = Math.abs(rr - r)
  const ds = Math.abs(rs - s)
  if (dq > dr && dq > ds) rq = -rr - rs
  else if (dr > ds) rr = -rq - rs
  else rs = -rq - rr
  return { q: rq, r: rr, s: rs }
}

/** Odd-r offset → cube. Integer in, integer out. */
export function offsetToCube(hex: OffsetHex): CubeHex {
  const q = hex.col - (hex.row - (hex.row & 1)) / 2
  return cube(q, hex.row)
}

/** Cube → odd-r offset — the inverse of {@link offsetToCube}. */
export function cubeToOffset(hex: CubeHex): OffsetHex {
  return { col: hex.q + (hex.r - (hex.r & 1)) / 2, row: hex.r }
}

const SQRT3 = Math.sqrt(3)

/** Cube hex → cartesian centre point, pointy-top, hex size 1. */
export function hexToCart(hex: CubeHex): CartPoint {
  return { x: SQRT3 * (hex.q + hex.r / 2), y: 1.5 * hex.r }
}

/** Cartesian point → the cube hex containing it — the inverse of {@link hexToCart}. */
export function cartToHex(point: CartPoint): CubeHex {
  const q = (point.x * SQRT3) / 3 - point.y / 3
  const r = (point.y * 2) / 3
  return cubeRound(q, r, -q - r)
}

/** Hex distance between two odd-r offset addresses. */
export function offsetHexDistance(a: OffsetHex, b: OffsetHex): number {
  return cubeDistance(offsetToCube(a), offsetToCube(b))
}

/**
 * The (up to) six neighbors of an offset hex that fall inside a
 * `width`×`height` rectangular board, in {@link CUBE_DIRECTIONS} order.
 */
export function offsetHexNeighbors(hex: OffsetHex, width: number, height: number): OffsetHex[] {
  const out: OffsetHex[] = []
  for (const n of cubeNeighbors(offsetToCube(hex))) {
    const o = cubeToOffset(n)
    if (o.col >= 0 && o.col < width && o.row >= 0 && o.row < height) out.push(o)
  }
  return out
}
