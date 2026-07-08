import type { Coord } from '@aop/shared'

/**
 * Pure geometry/turn-math for the naval course preview (#375): hovering (or
 * keyboard-cursoring, or a first touch tap) a water tile with a captain
 * selected previews the sea route there as a dotted line, colored by how many
 * of the captain's turns the route spans. Kept framework-free like
 * mapCursor.ts/mapLayout.ts/shipAnimation.ts — MapCanvas turns these into
 * pixels, this module only knows about path indices and movement points.
 *
 * All three functions are topology-agnostic: they operate on `path` (already
 * produced by `findPath`, which dispatches through the map's square/hex
 * adjacency) and never look at coordinates themselves, except `arrowheadAngle`,
 * which works in whatever 2D space its two points are given in (pixel space,
 * in practice).
 */

/** One dot along the previewed route, at `path[index]`. */
export interface DotSegment {
  /** Index into the previewed `path` (1..path.length-1 — index 0 is the
   * captain's current tile, which never gets a dot of its own). */
  index: number
  /** True if this leg completes within the captain's current remaining
   * movement (drawn gold/"now"); false if it only happens on a later turn
   * (drawn muted/"later"), once movement refreshes. */
  thisTurn: boolean
}

/**
 * One dot per step of `path` (index 1 through the last), flagged by whether
 * that step falls within this turn's remaining `movementPoints` or a later
 * turn (after `maxMovementPoints` refreshes). A path of length 0 or 1 (no
 * captain selected, or hovering the captain's own tile) yields no segments.
 */
export function pathToDotSegments(
  path: Coord[],
  movementPoints: number,
  maxMovementPoints: number,
): DotSegment[] {
  const segments: DotSegment[] = []
  for (let i = 1; i < path.length; i++) {
    segments.push({ index: i, thisTurn: i <= movementPoints })
  }
  return segments
}

/**
 * Path indices where a turn boundary falls — the last index reachable this
 * turn, then every `maxMovementPoints` steps after (each a fresh turn's worth
 * of movement once `refreshMovement` tops the captain back up) — so the
 * renderer can draw a ring dot at each one. Only indices that are actually on
 * the path (`1..pathLength-1`) are returned; a path that fits entirely within
 * `movementPoints` yields no boundaries at all.
 */
export function turnBoundaryIndices(
  pathLength: number,
  movementPoints: number,
  maxMovementPoints: number,
): number[] {
  const indices: number[] = []
  const lastIndex = pathLength - 1
  if (lastIndex < 1) return indices

  const firstBoundary = Math.max(0, movementPoints)
  if (firstBoundary >= 1 && firstBoundary <= lastIndex) indices.push(firstBoundary)

  if (maxMovementPoints > 0) {
    for (
      let next = firstBoundary + maxMovementPoints;
      next <= lastIndex;
      next += maxMovementPoints
    ) {
      indices.push(next)
    }
  }
  return indices
}

/** Direction from `p1` to `p2`, in radians (`atan2`) — the triangle rotation
 * for an arrowhead pointing from the second-to-last to the last preview point. */
export function arrowheadAngle(p1: Coord, p2: Coord): number {
  return Math.atan2(p2.y - p1.y, p2.x - p1.x)
}
