import type { GridTopology } from '@aop/engine'
import type { Coord } from '@aop/shared'
import { cellCenter, cellPolygon, pixelToCell } from './mapLayout'

/**
 * Painted-world region tracing (#392/#393): turns a predicate over grid cells
 * ("is this cell explored land?") into smoothed closed outlines in world
 * pixels, so terrain renders as organic shapes instead of per-cell fills.
 *
 * Topology-agnostic by construction: it walks each region cell's polygon from
 * mapLayout's `cellPolygon`, finds the neighbor across each edge by reflecting
 * the cell centre through the edge midpoint (exact for any edge-to-edge
 * tiling, square or hex), keeps the edges whose far side is outside the
 * region, and chains those edges into closed loops. Deterministic — pure
 * geometry from the cell grid, no randomness — and render-only: nothing here
 * touches engine state.
 */

/** A traced boundary: flat [x0,y0,x1,y1,…] points, and whether it encloses a
 * hole (water inside a landmass) rather than an outer region outline. */
export interface RegionLoop {
  points: number[]
  hole: boolean
}

/** Quantize a float point to a stable map key so corners computed from
 * neighboring cells (equal up to float error) chain reliably. */
const pointKey = (x: number, y: number): string => `${Math.round(x * 64)},${Math.round(y * 64)}`

/**
 * The grid cell on the far side of edge `i` of cell `(x, y)`'s polygon: the
 * cell centre reflected through the edge midpoint. In an edge-to-edge tiling
 * the reflected point IS the neighbor's centre, so `pixelToCell` recovers it
 * without any per-topology direction table. May be out of the map's bounds —
 * callers treat out-of-bounds as "not in region".
 */
export function neighborAcrossEdge(
  topology: GridTopology,
  x: number,
  y: number,
  edgeIndex: number,
  tileSize: number,
): Coord {
  const poly = cellPolygon(topology, x, y, tileSize)
  const n = poly.length / 2
  const ax = poly[2 * edgeIndex]!
  const ay = poly[2 * edgeIndex + 1]!
  const bx = poly[2 * ((edgeIndex + 1) % n)]!
  const by = poly[2 * ((edgeIndex + 1) % n) + 1]!
  const c = cellCenter(topology, x, y, tileSize)
  return pixelToCell(topology, ax + bx - c.x, ay + by - c.y, tileSize)
}

/** Twice the signed area of a closed loop (shoelace). Sign encodes winding. */
function signedArea2(points: number[]): number {
  let sum = 0
  for (let i = 0; i < points.length; i += 2) {
    const j = (i + 2) % points.length
    sum += points[i]! * points[j + 1]! - points[j]! * points[i + 1]!
  }
  return sum
}

/**
 * Trace the boundary loops of the region `{(x,y) | inRegion(x,y)}` over a
 * `width`×`height` grid. Returns each closed loop in world pixels with
 * `hole: true` for loops that wind opposite to the outer outlines (enclosed
 * water inside a landmass). Cells outside the grid bounds are outside the
 * region, so map-edge cells contribute their outer edges.
 */
export function traceRegionLoops(
  topology: GridTopology,
  width: number,
  height: number,
  tileSize: number,
  inRegion: (x: number, y: number) => boolean,
): RegionLoop[] {
  // Collect every polygon edge whose far side leaves the region, keyed by the
  // quantized start point so loop-walking is O(1) per step. Edges are wound in
  // cellPolygon's corner order, which is consistent across cells, so every
  // outer loop ends up with one winding and every hole with the other.
  const segments = new Map<string, { ax: number; ay: number; bx: number; by: number }[]>()
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (!inRegion(x, y)) continue
      const poly = cellPolygon(topology, x, y, tileSize)
      const n = poly.length / 2
      for (let i = 0; i < n; i++) {
        const nb = neighborAcrossEdge(topology, x, y, i, tileSize)
        const inside =
          nb.x >= 0 && nb.x < width && nb.y >= 0 && nb.y < height && inRegion(nb.x, nb.y)
        if (inside) continue
        const ax = poly[2 * i]!
        const ay = poly[2 * i + 1]!
        const bx = poly[2 * ((i + 1) % n)]!
        const by = poly[2 * ((i + 1) % n) + 1]!
        const key = pointKey(ax, ay)
        const list = segments.get(key)
        if (list) list.push({ ax, ay, bx, by })
        else segments.set(key, [{ ax, ay, bx, by }])
      }
    }
  }

  // Chain segments end-to-start into closed loops. At a pinch point (two
  // region cells touching only at a corner) several boundary segments share an
  // endpoint; picking any continuation still closes every loop because each
  // point has as many outgoing as incoming boundary edges.
  const loops: number[][] = []
  for (const list of segments.values()) {
    while (list.length > 0) {
      const start = list.pop()!
      const points: number[] = [start.ax, start.ay]
      let cx = start.bx
      let cy = start.by
      for (;;) {
        const key = pointKey(cx, cy)
        if (pointKey(start.ax, start.ay) === key) break
        const nextList = segments.get(key)
        const next = nextList?.pop()
        if (!next) break // open chain — degenerate input; keep what we have
        points.push(next.ax, next.ay)
        cx = next.bx
        cy = next.by
      }
      if (points.length >= 6) loops.push(points)
    }
  }

  // Outer outlines all share one winding sign; holes wind the other way. The
  // dominant sign by total area is the outer one (a region always has at least
  // as much outline area as hole area).
  const areas = loops.map(signedArea2)
  let positive = 0
  let negative = 0
  for (const a of areas) {
    if (a >= 0) positive += a
    else negative -= a
  }
  const outerSign = positive >= negative ? 1 : -1
  return loops.map((points, i) => ({ points, hole: Math.sign(areas[i]!) !== outerSign }))
}

/**
 * One pass of Chaikin corner-cutting on a closed loop: each edge contributes
 * its ¼ and ¾ points, doubling the point count and rounding every corner.
 * Two passes turn hex/square cell outlines into coastline-smooth curves.
 */
function chaikinOnce(points: number[]): number[] {
  const out: number[] = []
  const n = points.length / 2
  for (let i = 0; i < n; i++) {
    const ax = points[2 * i]!
    const ay = points[2 * i + 1]!
    const bx = points[2 * ((i + 1) % n)]!
    const by = points[2 * ((i + 1) % n) + 1]!
    out.push(ax * 0.75 + bx * 0.25, ay * 0.75 + by * 0.25)
    out.push(ax * 0.25 + bx * 0.75, ay * 0.25 + by * 0.75)
  }
  return out
}

/** `iterations` passes of closed-loop Chaikin smoothing. */
export function smoothLoop(points: number[], iterations: number): number[] {
  let result = points
  for (let i = 0; i < iterations; i++) result = chaikinOnce(result)
  return result
}

/**
 * Split a closed loop's flat `[x0,y0,x1,y1,…]` point array into consecutive open
 * runs of up to `runLength` points, each overlapping the next by one point and
 * the final run bridging back to the loop's start — so stroking every run
 * separately reproduces the whole perimeter with no gaps between runs. Used by
 * the coast treatment (#403) to give each stretch of surf its own alpha instead
 * of one uniform whole-loop stroke.
 */
export function loopStrokeRuns(points: number[], runLength: number): number[][] {
  const n = points.length / 2
  if (n < 2 || runLength < 2) return []
  // Append the start point so the last run closes the loop back onto it.
  const closed = [...points, points[0]!, points[1]!]
  const total = n + 1
  const runs: number[][] = []
  for (let start = 0; start < total - 1; start += runLength - 1) {
    const end = Math.min(start + runLength, total) // exclusive point index
    runs.push(closed.slice(start * 2, end * 2))
  }
  return runs
}
