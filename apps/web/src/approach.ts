import { findPath, mapNeighbors, tileIndex, type GameMap } from '@aop/engine'
import type { Coord } from '@aop/shared'

/**
 * Naval targeting (#376): the cheapest water-hex approach to `targetPos` from
 * `from` — the leg a captain must sail before it can engage a target that
 * isn't already adjacent. Tries every neighbor of the target (`mapNeighbors`,
 * topology-aware) and keeps the shortest `findPath` result.
 *
 * Returns the full inclusive path (same contract as `findPath`: `path[0]` is
 * `from`, `path.at(-1)` is the chosen approach hex), or `null` if no neighbor
 * of the target is reachable by sea at all (e.g. an island-locked target).
 * `path.length - 1` is the movement-point cost of the approach leg — zero
 * when `from` is already one of the target's neighbors, since `findPath`
 * returns the single-tile `[from]` path for a same-tile query.
 *
 * Ties (two neighbors reachable at equal cost) break on the lower tile
 * index — the same deterministic rule `findPath`'s own A* uses internally —
 * so the same query picks the same approach hex on every machine. This
 * matters because the result feeds a `moveCaptain` action (replay/multiplayer
 * parity requires it to be reproducible).
 */
export function findApproachPath(map: GameMap, from: Coord, targetPos: Coord): Coord[] | null {
  let best: Coord[] | null = null
  let bestCost = Infinity
  let bestTileIndex = Infinity
  for (const neighbor of mapNeighbors(map, targetPos)) {
    const path = findPath(map, from, neighbor)
    if (!path) continue
    const cost = path.length - 1
    const idx = tileIndex(map, neighbor.x, neighbor.y)
    if (cost < bestCost || (cost === bestCost && idx < bestTileIndex)) {
      best = path
      bestCost = cost
      bestTileIndex = idx
    }
  }
  return best
}
