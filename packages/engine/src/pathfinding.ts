import type { Coord } from '@aop/shared'
import { chebyshevDistance, coordsEqual } from '@aop/shared'
import { isWaterTile, neighbors8, tileAt, tileIndex, type GameMap } from './map'

/**
 * Deterministic A* pathfinding for naval movement.
 *
 * Ships move over water only (deep/shallows/port-adjacent water), 8-directionally,
 * at a uniform cost of one movement point per step. The heuristic is Chebyshev
 * distance, which is admissible under uniform 8-dir cost, so A* returns a true
 * shortest path.
 *
 * Determinism is load-bearing (replay + multiplayer authority): ties in the open
 * set are broken by a fixed key — lower f, then lower h, then lower tile index —
 * so the same query always yields the byte-identical path on every machine.
 */

interface Node {
  coord: Coord
  g: number
  f: number
  h: number
  parent: number | null
}

/**
 * Shortest water path from `from` to `to` inclusive of both endpoints, or `null`
 * if unreachable. Path length minus one is the movement-point cost.
 */
export function findPath(map: GameMap, from: Coord, to: Coord): Coord[] | null {
  if (!isWaterTile(tileAt(map, from)) || !isWaterTile(tileAt(map, to))) return null
  if (coordsEqual(from, to)) return [from]

  const nodes = new Map<number, Node>()
  const closed = new Set<number>()
  const open: number[] = []

  const startIdx = tileIndex(map, from.x, from.y)
  nodes.set(startIdx, {
    coord: from,
    g: 0,
    h: chebyshevDistance(from, to),
    f: chebyshevDistance(from, to),
    parent: null,
  })
  open.push(startIdx)

  const goalIdx = tileIndex(map, to.x, to.y)

  while (open.length > 0) {
    // Pick the open node with the best (deterministic) priority.
    let bestPos = 0
    for (let i = 1; i < open.length; i++) {
      if (betterThan(nodes.get(open[i]!)!, nodes.get(open[bestPos]!)!, open[i]!, open[bestPos]!)) {
        bestPos = i
      }
    }
    const currentIdx = open.splice(bestPos, 1)[0]!
    if (currentIdx === goalIdx) return reconstruct(nodes, currentIdx)
    closed.add(currentIdx)

    const current = nodes.get(currentIdx)!
    for (const n of neighbors8(map, current.coord)) {
      if (!isWaterTile(tileAt(map, n))) continue
      const nIdx = tileIndex(map, n.x, n.y)
      if (closed.has(nIdx)) continue

      const tentativeG = current.g + 1
      const existing = nodes.get(nIdx)
      if (existing && tentativeG >= existing.g) continue

      const h = chebyshevDistance(n, to)
      const node: Node = { coord: n, g: tentativeG, h, f: tentativeG + h, parent: currentIdx }
      nodes.set(nIdx, node)
      if (!existing) open.push(nIdx)
    }
  }

  return null
}

/** Movement-point cost of travelling `from` -> `to`, or `null` if unreachable. */
export function pathCost(map: GameMap, from: Coord, to: Coord): number | null {
  const path = findPath(map, from, to)
  return path ? path.length - 1 : null
}

function betterThan(a: Node, b: Node, aIdx: number, bIdx: number): boolean {
  if (a.f !== b.f) return a.f < b.f
  if (a.h !== b.h) return a.h < b.h
  return aIdx < bIdx
}

function reconstruct(nodes: Map<number, Node>, goalIdx: number): Coord[] {
  const path: Coord[] = []
  let idx: number | null = goalIdx
  while (idx !== null) {
    const node: Node = nodes.get(idx)!
    path.push(node.coord)
    idx = node.parent
  }
  path.reverse()
  return path
}
