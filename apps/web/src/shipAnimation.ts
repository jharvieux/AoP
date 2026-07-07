import type { Coord } from '@aop/shared'

/**
 * Pure, framework-free helpers for animating a ship sprite along its traversed sea path
 * (#297) instead of teleporting straight to the destination tile. Kept separate from
 * MapCanvas so the math is unit-testable without a Pixi/canvas environment — MapCanvas.tsx
 * drives it from the render ticker's per-frame delta.
 */

export interface TilePoint {
  x: number
  y: number
}

/** Milliseconds of travel per tile of path arc length (see {@link pathArcLength}), tuned to
 * read as a deliberate sail rather than a snap or a sluggish drift. */
const MS_PER_TILE = 140
/** Floor/ceiling so a one-tile hop and a many-tile voyage both feel intentional. */
const MIN_DURATION_MS = 160
const MAX_DURATION_MS = 1400

/** Ease-in-out cubic — slow leaving the origin tile, slow settling onto the destination
 * tile, brisk in between. */
export function easeInOutCubic(t: number): number {
  const clamped = Math.min(1, Math.max(0, t))
  return clamped < 0.5 ? 4 * clamped ** 3 : 1 - (-2 * clamped + 2) ** 3 / 2
}

/** Total travelled distance along a tile path: an orthogonal step counts as 1, a diagonal
 * step as sqrt(2) — so animation speed reads consistently regardless of how many diagonal
 * vs. orthogonal steps `findPath`'s 8-directional search happened to choose. */
export function pathArcLength(path: readonly Coord[]): number {
  let total = 0
  for (let i = 1; i < path.length; i++) {
    total += Math.hypot(path[i]!.x - path[i - 1]!.x, path[i]!.y - path[i - 1]!.y)
  }
  return total
}

/** Duration for animating the whole path, scaled by its arc length and clamped to a sane
 * range. */
export function shipAnimDurationMs(path: readonly Coord[]): number {
  return Math.min(MAX_DURATION_MS, Math.max(MIN_DURATION_MS, pathArcLength(path) * MS_PER_TILE))
}

/**
 * Position (in tile units, fractional) at fraction `t` (0..1) along `path`, walked by arc
 * length so travel speed is constant across diagonal and orthogonal segments. `path` must
 * have at least one point; a single-point (or zero-length) path returns that point for
 * every `t`.
 */
export function pathPointAt(path: readonly Coord[], t: number): TilePoint {
  const first = path[0]
  if (!first) return { x: 0, y: 0 }
  if (path.length === 1) return { x: first.x, y: first.y }

  const total = pathArcLength(path)
  if (total === 0) return { x: first.x, y: first.y }

  const target = Math.min(1, Math.max(0, t)) * total
  let travelled = 0
  for (let i = 1; i < path.length; i++) {
    const a = path[i - 1]!
    const b = path[i]!
    const segLength = Math.hypot(b.x - a.x, b.y - a.y)
    if (travelled + segLength >= target || i === path.length - 1) {
      const local = segLength === 0 ? 0 : Math.min(1, Math.max(0, (target - travelled) / segLength))
      return { x: a.x + (b.x - a.x) * local, y: a.y + (b.y - a.y) * local }
    }
    travelled += segLength
  }
  const last = path[path.length - 1]!
  return { x: last.x, y: last.y }
}
