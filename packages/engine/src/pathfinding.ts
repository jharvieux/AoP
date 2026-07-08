import type { Coord } from '@aop/shared'
import { coordsEqual } from '@aop/shared'
import { isWaterTile, mapDistance, mapNeighbors, tileAt, tileIndex, type GameMap } from './map'

/**
 * Deterministic A* pathfinding for naval movement.
 *
 * Ships move over water only (deep/shallows/port-adjacent water) at a uniform
 * cost of one movement point per step, along the map's topology (#348):
 * 8-directional on square maps, 6-directional on hex maps — adjacency and the
 * heuristic both dispatch through `mapNeighbors`/`mapDistance`. The heuristic
 * (Chebyshev on square, true hex distance on hex) is admissible under the
 * matching uniform-cost neighbor set, so A* returns a true shortest path.
 *
 * Determinism is load-bearing (replay + multiplayer authority): ties in the open
 * set are broken by a fixed key — lower f, then lower h, then lower tile index —
 * so the same query always yields the byte-identical path on every machine. The
 * open set is a binary heap ordered by that exact same tuple (see {@link MinHeap}),
 * so it returns byte-identical paths to the old O(n)-scan implementation while
 * scaling to O(log n) per pop instead of O(n) (#214).
 */

interface Node {
  coord: Coord
  g: number
  f: number
  h: number
  parent: number | null
}

interface HeapEntry {
  idx: number
  f: number
  h: number
}

/**
 * Binary min-heap ordered by the same deterministic tie-break the old linear scan
 * used: lower f, then lower h, then lower tile index. Stale entries (superseded by
 * a cheaper update to the same tile) are left in place and skipped lazily at pop
 * time via the caller's `closed` set, which is standard for A-star/Dijkstra with
 * decrease-key and keeps the total ordering identical to a fresh scan.
 */
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

function before(a: HeapEntry, b: HeapEntry): boolean {
  if (a.f !== b.f) return a.f < b.f
  if (a.h !== b.h) return a.h < b.h
  return a.idx < b.idx
}

/**
 * Per-map cache of water connected-components (topology-aware adjacency), so a
 * query between two tiles in different sea basins returns `null` in O(1) instead
 * of flooding the whole ocean first (#214). Terrain is immutable for the lifetime
 * of a `GameMap`, so the cache is keyed by object identity and never invalidated.
 */
const waterComponentCache = new WeakMap<GameMap, Int32Array>()

function waterComponents(map: GameMap): Int32Array {
  const cached = waterComponentCache.get(map)
  if (cached) return cached

  const components = new Int32Array(map.width * map.height).fill(-1)
  let nextComponent = 0
  const stack: number[] = []

  for (let y = 0; y < map.height; y++) {
    for (let x = 0; x < map.width; x++) {
      const startIdx = tileIndex(map, x, y)
      if (components[startIdx] !== -1 || !isWaterTile(map.tiles[startIdx])) continue

      components[startIdx] = nextComponent
      stack.push(startIdx)
      while (stack.length > 0) {
        const curIdx = stack.pop()!
        const cx = curIdx % map.width
        const cy = Math.floor(curIdx / map.width)
        for (const n of mapNeighbors(map, { x: cx, y: cy })) {
          const nIdx = tileIndex(map, n.x, n.y)
          if (components[nIdx] !== -1 || !isWaterTile(tileAt(map, n))) continue
          components[nIdx] = nextComponent
          stack.push(nIdx)
        }
      }
      nextComponent++
    }
  }

  waterComponentCache.set(map, components)
  return components
}

/**
 * Shortest water path from `from` to `to` inclusive of both endpoints, or `null`
 * if unreachable. Path length minus one is the movement-point cost.
 */
export function findPath(map: GameMap, from: Coord, to: Coord): Coord[] | null {
  if (!isWaterTile(tileAt(map, from)) || !isWaterTile(tileAt(map, to))) return null
  if (coordsEqual(from, to)) return [from]

  const startIdx = tileIndex(map, from.x, from.y)
  const goalIdx = tileIndex(map, to.x, to.y)

  // Different sea basins can never connect; skip the search entirely (#214).
  const components = waterComponents(map)
  if (components[startIdx] !== components[goalIdx]) return null

  const nodes = new Map<number, Node>()
  const closed = new Set<number>()
  const heap = new MinHeap()

  const startH = mapDistance(map, from, to)
  nodes.set(startIdx, { coord: from, g: 0, h: startH, f: startH, parent: null })
  heap.push({ idx: startIdx, f: startH, h: startH })

  while (heap.size > 0) {
    const entry = heap.pop()!
    const currentIdx = entry.idx
    if (closed.has(currentIdx)) continue // stale entry superseded by a cheaper update
    if (currentIdx === goalIdx) return reconstruct(nodes, currentIdx)
    closed.add(currentIdx)

    const current = nodes.get(currentIdx)!
    for (const n of mapNeighbors(map, current.coord)) {
      if (!isWaterTile(tileAt(map, n))) continue
      const nIdx = tileIndex(map, n.x, n.y)
      if (closed.has(nIdx)) continue

      const tentativeG = current.g + 1
      const existing = nodes.get(nIdx)
      if (existing && tentativeG >= existing.g) continue

      const h = mapDistance(map, n, to)
      const node: Node = { coord: n, g: tentativeG, h, f: tentativeG + h, parent: currentIdx }
      nodes.set(nIdx, node)
      heap.push({ idx: nIdx, f: node.f, h: node.h })
    }
  }

  return null
}

/** Movement-point cost of travelling `from` -> `to`, or `null` if unreachable. */
export function pathCost(map: GameMap, from: Coord, to: Coord): number | null {
  const path = findPath(map, from, to)
  return path ? path.length - 1 : null
}

/**
 * Every water tile a ship at `from` could move to within `movementPoints`, i.e.
 * whose shortest water path from `from` costs between 1 and `movementPoints`
 * steps inclusive. The origin tile itself is never included (cost 0), so
 * `movementPoints <= 0` yields `[]` — the caller shades "where can I go", not
 * "where am I". Powers the movement-range highlight on ship selection (#371).
 *
 * A breadth-first flood over water only, along the map's topology (#348), so it
 * works identically on square (8-neighbor) and hex (6-neighbor) maps. Pure and
 * deterministic — no RNG — and the result is sorted by tile index so the same
 * query yields a byte-identical array on every machine, regardless of the
 * neighbor iteration order the flood happened to visit tiles in.
 */
export function reachableTiles(map: GameMap, from: Coord, movementPoints: number): Coord[] {
  if (movementPoints <= 0 || !isWaterTile(tileAt(map, from))) return []

  const startIdx = tileIndex(map, from.x, from.y)
  const dist = new Map<number, number>([[startIdx, 0]])
  const queue: Coord[] = [from]
  const reached: number[] = []

  for (let i = 0; i < queue.length; i++) {
    const cur = queue[i]!
    const d = dist.get(tileIndex(map, cur.x, cur.y))!
    if (d === movementPoints) continue // depth cap: nothing past here is in range
    for (const n of mapNeighbors(map, cur)) {
      if (!isWaterTile(tileAt(map, n))) continue
      const nIdx = tileIndex(map, n.x, n.y)
      if (dist.has(nIdx)) continue // BFS first-visit is the shortest, uniform-cost path
      dist.set(nIdx, d + 1)
      reached.push(nIdx)
      queue.push(n)
    }
  }

  reached.sort((a, b) => a - b)
  return reached.map((idx) => ({ x: idx % map.width, y: Math.floor(idx / map.width) }))
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
