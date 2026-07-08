import { cubeDistance, cubeNeighbors, cubeToOffset, offsetToCube, type OffsetHex } from './hexGrid'

/**
 * Deterministic A* over a rectangular hex board — world-map hex prototype
 * (#348, Phase 1). Additive and isolated: the canonical square-grid
 * `pathfinding.ts` is untouched, and nothing in the reducer calls this yet.
 *
 * Movement is 6-directional at a uniform cost of one point per step over
 * passable hexes. The heuristic is true hex distance, which is admissible and
 * consistent under uniform cost, so A* returns a genuinely shortest path — no
 * diagonal bias, unlike Chebyshev on the square grid.
 *
 * Determinism mirrors the square-grid contract: open-set ties break on a fixed
 * key — lower f, then lower h, then lower row-major hex index — via the same
 * binary-heap-with-lazy-deletion scheme as `pathfinding.ts`. The heap is
 * duplicated rather than shared because this file must stay deletable in one
 * piece if the hex conversion is rejected; unify on adoption.
 */

/** A rectangular board of pointy-top hexes addressed by odd-r offset coords. */
export interface HexGridMap {
  width: number
  height: number
  /** Row-major `width * height`; `true` = traversable at cost 1. */
  passable: readonly boolean[]
}

export function hexTileIndex(map: HexGridMap, hex: OffsetHex): number {
  return hex.row * map.width + hex.col
}

export function isHexPassable(map: HexGridMap, hex: OffsetHex): boolean {
  if (hex.col < 0 || hex.col >= map.width || hex.row < 0 || hex.row >= map.height) return false
  return map.passable[hexTileIndex(map, hex)] === true
}

interface Node {
  hex: OffsetHex
  g: number
  h: number
  f: number
  parent: number | null
}

interface HeapEntry {
  idx: number
  f: number
  h: number
}

function before(a: HeapEntry, b: HeapEntry): boolean {
  if (a.f !== b.f) return a.f < b.f
  if (a.h !== b.h) return a.h < b.h
  return a.idx < b.idx
}

class MinHeap {
  private items: HeapEntry[] = []

  get size(): number {
    return this.items.length
  }

  push(entry: HeapEntry): void {
    const items = this.items
    items.push(entry)
    let i = items.length - 1
    while (i > 0) {
      const parent = (i - 1) >> 1
      if (!before(items[i]!, items[parent]!)) break
      ;[items[i], items[parent]] = [items[parent]!, items[i]!]
      i = parent
    }
  }

  pop(): HeapEntry | undefined {
    const items = this.items
    const top = items[0]
    if (top === undefined) return undefined
    const last = items.pop()!
    if (items.length > 0) {
      items[0] = last
      let i = 0
      for (;;) {
        const left = i * 2 + 1
        const right = i * 2 + 2
        let smallest = i
        if (left < items.length && before(items[left]!, items[smallest]!)) smallest = left
        if (right < items.length && before(items[right]!, items[smallest]!)) smallest = right
        if (smallest === i) break
        ;[items[i], items[smallest]] = [items[smallest]!, items[i]!]
        i = smallest
      }
    }
    return top
  }
}

function hexHeuristic(a: OffsetHex, b: OffsetHex): number {
  return cubeDistance(offsetToCube(a), offsetToCube(b))
}

/**
 * Shortest hex path from `from` to `to` inclusive of both endpoints, or `null`
 * if unreachable. Path length minus one is the movement-point cost.
 */
export function findHexPath(map: HexGridMap, from: OffsetHex, to: OffsetHex): OffsetHex[] | null {
  if (!isHexPassable(map, from) || !isHexPassable(map, to)) return null
  if (from.col === to.col && from.row === to.row) return [from]

  const startIdx = hexTileIndex(map, from)
  const goalIdx = hexTileIndex(map, to)

  const nodes = new Map<number, Node>()
  const closed = new Set<number>()
  const heap = new MinHeap()

  const startH = hexHeuristic(from, to)
  nodes.set(startIdx, { hex: from, g: 0, h: startH, f: startH, parent: null })
  heap.push({ idx: startIdx, f: startH, h: startH })

  while (heap.size > 0) {
    const entry = heap.pop()!
    const currentIdx = entry.idx
    if (closed.has(currentIdx)) continue // stale entry superseded by a cheaper update
    if (currentIdx === goalIdx) return reconstruct(nodes, currentIdx)
    closed.add(currentIdx)

    const current = nodes.get(currentIdx)!
    for (const n of cubeNeighbors(offsetToCube(current.hex))) {
      const o = cubeToOffset(n)
      if (!isHexPassable(map, o)) continue
      const nIdx = hexTileIndex(map, o)
      if (closed.has(nIdx)) continue

      const tentativeG = current.g + 1
      const existing = nodes.get(nIdx)
      if (existing && tentativeG >= existing.g) continue

      const h = hexHeuristic(o, to)
      const node: Node = { hex: o, g: tentativeG, h, f: tentativeG + h, parent: currentIdx }
      nodes.set(nIdx, node)
      heap.push({ idx: nIdx, f: node.f, h: node.h })
    }
  }

  return null
}

/** Movement-point cost of travelling `from` -> `to`, or `null` if unreachable. */
export function hexPathCost(map: HexGridMap, from: OffsetHex, to: OffsetHex): number | null {
  const path = findHexPath(map, from, to)
  return path ? path.length - 1 : null
}

function reconstruct(nodes: Map<number, Node>, goalIdx: number): OffsetHex[] {
  const path: OffsetHex[] = []
  let idx: number | null = goalIdx
  while (idx !== null) {
    const node: Node = nodes.get(idx)!
    path.push(node.hex)
    idx = node.parent
  }
  path.reverse()
  return path
}
