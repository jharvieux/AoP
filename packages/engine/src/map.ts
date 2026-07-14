import type { Coord, MapSize } from '@aop/shared'
import { chebyshevDistance } from '@aop/shared'
import { hexDistance, hexNeighbors } from './hex'
import { nextFloat, nextInt, seedRng, type RngState } from './rng'

/**
 * Seeded procedural map generation for Age of Plunder.
 *
 * Grid choice: square grid with 8-directional movement (see #6). Square tiles
 * read cleanly on small mobile screens and 8-dir movement keeps naval travel
 * feeling free without hex bookkeeping. The hex-grid conversion (#348) adds an
 * opt-in `topology` field: a map may instead be a rectangle of pointy-top
 * hexes addressed odd-r (`x` = col, `y` = row), and every adjacency/distance
 * consumer dispatches through {@link mapNeighbors}/{@link mapDistance}. The
 * generator accepts an optional `topology` argument: pass `'hex'` and every
 * adjacency/distance decision (coastlines, island spacing, start placement)
 * runs on hex semantics and the result carries `topology: 'hex'`. Omitted or
 * `'square'`, output is byte-identical to the pre-hex generator.
 *
 * The generator is a pure function of `(seed, mapSize, playerCount)` — it draws
 * exclusively from the seeded RNG, so the same inputs yield a byte-identical map
 * on every machine. Fairness is guaranteed by construction: every player gets an
 * identically-shaped home island whose centre sits on a circle around the map
 * centre, so start positions are equidistant and have equal nearby land.
 */

export type TileType = 'deep' | 'shallows' | 'land' | 'port'

export interface Tile {
  type: TileType
  /** Island id for `land`/`port` tiles; -1 for water. Home islands are 0..N-1. */
  island: number
}

/**
 * How a map's coordinates connect (#348). `square` is the original 8-neighbor
 * king-move grid; `hex` reinterprets the same row-major `{x, y}` coordinates
 * as odd-r pointy-top hexes (x = col, y = row) with 6 neighbors and true hex
 * distance. The field is optional and absent on every pre-hex map, so
 * existing saves, replays, and serialized GameStates are byte-identical.
 */
export type GridTopology = 'square' | 'hex'

export interface GameMap {
  width: number
  height: number
  /** Row-major, length `width * height`. Access via {@link tileAt}. */
  tiles: Tile[]
  /** One water start tile per player index; index i belongs to players[i]. */
  startPositions: Coord[]
  /** Grid topology; absent means `square` (see {@link GridTopology}). */
  topology?: GridTopology
}

export const MAP_DIMENSIONS: Record<MapSize, number> = {
  // Operator directive (2026-07-14): every size preset is 4x its former AREA —
  // both dimensions doubled (24/32/40/48 -> 48/64/80/96). Correlated content
  // knobs scaled in lock-step (see GAME_SETUP.homeIslandRadius and its xlarge
  // override in @aop/content): island discs doubled their radius so land area
  // keeps pace with sea area, which also gives every size real island
  // interiors — inland settlements now appear at every size, not just xlarge
  // (D-038 superseded). Neutral-island count already scales off `size` via the
  // size/6..size/4 formula below. Changing these breaks replay of generated
  // maps, so it bumps RULES_VERSION.
  small: 48,
  medium: 64,
  large: 80,
  xlarge: 96,
}

const SIZE_CODE: Record<MapSize, number> = { small: 1, medium: 2, large: 3, xlarge: 4 }

export function tileIndex(map: GameMap, x: number, y: number): number {
  return y * map.width + x
}

export function inBounds(map: GameMap, x: number, y: number): boolean {
  return x >= 0 && y >= 0 && x < map.width && y < map.height
}

export function tileAt(map: GameMap, coord: Coord): Tile | undefined {
  if (!inBounds(map, coord.x, coord.y)) return undefined
  return map.tiles[tileIndex(map, coord.x, coord.y)]
}

/** Water tiles are the only tiles a ship may occupy. Ports count as coastline water access. */
export function isWaterTile(tile: Tile | undefined): boolean {
  return tile?.type === 'deep' || tile?.type === 'shallows'
}

/** The 8 king-move neighbours of a coord, in a fixed (deterministic) order. */
const NEIGHBOR_OFFSETS: readonly Coord[] = [
  { x: 0, y: -1 },
  { x: 1, y: -1 },
  { x: 1, y: 0 },
  { x: 1, y: 1 },
  { x: 0, y: 1 },
  { x: -1, y: 1 },
  { x: -1, y: 0 },
  { x: -1, y: -1 },
]

export function neighbors8(map: GameMap, coord: Coord): Coord[] {
  const out: Coord[] = []
  for (const off of NEIGHBOR_OFFSETS) {
    const nx = coord.x + off.x
    const ny = coord.y + off.y
    if (inBounds(map, nx, ny)) out.push({ x: nx, y: ny })
  }
  return out
}

export function mapTopology(map: GameMap): GridTopology {
  return map.topology ?? 'square'
}

/**
 * The in-bounds neighbors of `coord` under the map's topology (#348): 8
 * king-move squares, or 6 odd-r hexes via the same integer hex math the
 * tactical battle board uses (hex.ts). Fixed iteration order either way, so
 * every consumer stays deterministic.
 */
export function mapNeighbors(map: GameMap, coord: Coord): Coord[] {
  if (mapTopology(map) === 'hex') {
    return hexNeighbors({ col: coord.x, row: coord.y }, map.width, map.height).map((h) => ({
      x: h.col,
      y: h.row,
    }))
  }
  return neighbors8(map, coord)
}

/**
 * Grid distance between two coords under the map's topology (#348): Chebyshev
 * on square maps (diagonals cost 1), true hex distance on hex maps. This is
 * the metric every range/adjacency check ("within distance 1") uses.
 */
export function mapDistance(map: GameMap, a: Coord, b: Coord): number {
  if (mapTopology(map) === 'hex') {
    return hexDistance({ col: a.x, row: a.y }, { col: b.x, row: b.y })
  }
  return chebyshevDistance(a, b)
}

function seedForMap(seed: number, mapSize: MapSize, playerCount: number): RngState {
  const mixed =
    (seed >>> 0) ^ Math.imul(playerCount, 0x9e3779b1) ^ Math.imul(SIZE_CODE[mapSize], 0x85ebca6b)
  return seedRng(mixed >>> 0)
}

export function generateMap(
  seed: number,
  mapSize: MapSize,
  playerCount: number,
  homeIslandRadius: number,
  homeIslandRingRadiusFactor: number,
  topology?: GridTopology,
): GameMap {
  if (playerCount < 2 || playerCount > 8) {
    throw new Error(`playerCount must be 2-8, got ${playerCount}`)
  }

  const size = MAP_DIMENSIONS[mapSize]
  const width = size
  const height = size
  const tiles: Tile[] = Array.from({ length: width * height }, () => ({
    type: 'deep' as TileType,
    island: -1,
  }))

  // Omit the field for square (explicit or defaulted) so pre-hex callers get
  // byte-identical output — serialized square maps must not grow a stray key.
  const map: GameMap = { width, height, tiles, startPositions: [] }
  if (topology === 'hex') map.topology = 'hex'
  let rng = seedForMap(seed, mapSize, playerCount)

  const center: Coord = { x: (width - 1) / 2, y: (height - 1) / 2 }
  const ringRadius = Math.min(width, height) * homeIslandRingRadiusFactor

  // A seeded phase rotation so different seeds orient the ring differently while
  // keeping every seat symmetric within a single map.
  let phase: number
  ;[rng, phase] = nextFloat(rng)
  phase *= Math.PI * 2

  const setLand = (x: number, y: number, island: number) => {
    if (!inBounds(map, x, y)) return
    const tile = map.tiles[tileIndex(map, x, y)]!
    tile.type = 'land'
    tile.island = island
  }

  const carveDisc = (cx: number, cy: number, radius: number, island: number) => {
    for (let dy = -radius; dy <= radius; dy++) {
      for (let dx = -radius; dx <= radius; dx++) {
        if (dx * dx + dy * dy <= radius * radius) setLand(cx + dx, cy + dy, island)
      }
    }
  }

  // Home islands: identical discs on a circle => equidistant, equal-resource starts.
  const islandCenters: Coord[] = []
  for (let i = 0; i < playerCount; i++) {
    const angle = phase + (Math.PI * 2 * i) / playerCount
    const cx = Math.round(center.x + Math.cos(angle) * ringRadius)
    const cy = Math.round(center.y + Math.sin(angle) * ringRadius)
    islandCenters.push({ x: cx, y: cy })
    carveDisc(cx, cy, homeIslandRadius, i)
  }

  // Neutral islands: scatter a size-scaled number away from home islands and each
  // other. Draws from the RNG so counts/positions are deterministic per seed.
  let neutralCount: number
  ;[rng, neutralCount] = nextInt(rng, Math.floor(size / 6), Math.floor(size / 4))
  let nextIslandId = playerCount
  let attempts = 0
  const placed: Array<{ c: Coord; r: number }> = islandCenters.map((c) => ({
    c,
    r: homeIslandRadius,
  }))
  let neutralPlaced = 0
  while (neutralPlaced < neutralCount && attempts < neutralCount * 20) {
    attempts++
    let fx: number
    let fy: number
    let fr: number
    ;[rng, fx] = nextFloat(rng)
    ;[rng, fy] = nextFloat(rng)
    ;[rng, fr] = nextFloat(rng)
    const cx = 2 + Math.floor(fx * (width - 4))
    const cy = 2 + Math.floor(fy * (height - 4))
    const radius = 1 + Math.floor(fr * homeIslandRadius)
    const c = { x: cx, y: cy }
    const clash = placed.some((p) => mapDistance(map, p.c, c) < p.r + radius + 2)
    if (clash) continue
    carveDisc(cx, cy, radius, nextIslandId)
    placed.push({ c, r: radius })
    nextIslandId++
    neutralPlaced++
  }

  // Coastline: any deep tile touching land becomes shallows.
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const tile = map.tiles[tileIndex(map, x, y)]!
      if (tile.type !== 'deep') continue
      const coastal = mapNeighbors(map, { x, y }).some(
        (n) => map.tiles[tileIndex(map, n.x, n.y)]!.type === 'land',
      )
      if (coastal) tile.type = 'shallows'
    }
  }

  // Ports + start positions: for each home island, mark the land tile nearest the
  // map centre as a port, then spawn the captain on the water tile just inward.
  const ports: Coord[] = []
  for (let i = 0; i < playerCount; i++) {
    const portTile = nearestLandToCenter(map, islandCenters[i]!, i, center)
    map.tiles[tileIndex(map, portTile.x, portTile.y)]!.type = 'port'
    map.startPositions.push(waterAdjacentTowardCenter(map, portTile, center))
    ports.push(portTile)
  }

  // Land-assault guarantee (operator directive, 2026-07-14): every capital must
  // be assailable overland, structurally — never by luck of the seed. Home
  // islands are solid discs so this post-pass is a no-op on healthy output; it
  // exists as a deterministic, RNG-free repair net (see ensureLandAssaultRoute)
  // so the guarantee is by construction, not by retry.
  for (const port of ports) {
    ensureLandAssaultRoute(map, port)
  }

  return map
}

/**
 * Water tiles a ship can actually reach: the flood-fill closure of `seeds`
 * (normally the map's start positions) over water under the map's topology.
 * A land-locked pond is water but not navigable — a party cannot be delivered
 * to its shore — so land-assault checks must use this, not raw water adjacency.
 */
export function navigableWaterTiles(map: GameMap, seeds: readonly Coord[]): Set<number> {
  const visited = new Set<number>()
  const queue: Coord[] = []
  for (const s of seeds) {
    const idx = tileIndex(map, s.x, s.y)
    if (isWaterTile(tileAt(map, s)) && !visited.has(idx)) {
      visited.add(idx)
      queue.push(s)
    }
  }
  while (queue.length > 0) {
    const current = queue.shift()!
    for (const n of mapNeighbors(map, current)) {
      const idx = tileIndex(map, n.x, n.y)
      if (visited.has(idx) || !isWaterTile(tileAt(map, n))) continue
      visited.add(idx)
      queue.push(n)
    }
  }
  return visited
}

/**
 * The land-assault guarantee (operator directive, 2026-07-14): a city on tile
 * `city` must be attackable by a landing party marching overland. Concretely,
 * mirroring the reducer's rules (disembark: a `land` tile at map-distance 1
 * from a ship on navigable water; parties march `land` tiles only; a party
 * assaults from a tile adjacent to the city), there must exist:
 *
 *  - a **disembark tile** `d`: a `land` tile adjacent to navigable water and
 *    NOT adjacent to the city itself (so the landing cannot be trivially
 *    contested from the walls, and a genuine overland march exists), and
 *  - an **assault position** `a`: a `land` tile adjacent to the city,
 *
 * with `d` and `a` in the same land-connected component. `navigableWater`
 * defaults to {@link navigableWaterTiles} seeded from the map's start
 * positions. Used by the generator's repair post-pass and by the property
 * tests that hold authored maps to the same guarantee.
 */
export function hasLandAssaultRoute(
  map: GameMap,
  city: Coord,
  navigableWater?: ReadonlySet<number>,
): boolean {
  const navigable = navigableWater ?? navigableWaterTiles(map, map.startPositions)
  // Multi-source flood fill over `land` from every assault position; succeed
  // the moment the component reaches a qualifying disembark tile.
  const visited = new Set<number>()
  const queue: Coord[] = []
  for (const n of mapNeighbors(map, city)) {
    if (tileAt(map, n)?.type !== 'land') continue
    const idx = tileIndex(map, n.x, n.y)
    if (!visited.has(idx)) {
      visited.add(idx)
      queue.push(n)
    }
  }
  while (queue.length > 0) {
    const current = queue.shift()!
    if (
      mapDistance(map, current, city) > 1 &&
      mapNeighbors(map, current).some((n) => navigable.has(tileIndex(map, n.x, n.y)))
    ) {
      return true
    }
    for (const n of mapNeighbors(map, current)) {
      const idx = tileIndex(map, n.x, n.y)
      if (visited.has(idx) || tileAt(map, n)?.type !== 'land') continue
      visited.add(idx)
      queue.push(n)
    }
  }
  return false
}

/**
 * Deterministic, RNG-free repair for a capital missing the land-assault
 * guarantee: grow a two-tile land bridge off the port — a `firstStep` tile
 * adjacent to the port and a `secondStep` beyond it (the new disembark tile) —
 * trying candidate directions in the fixed {@link mapNeighbors} order and
 * keeping the first that verifiably restores the guarantee (re-checked against
 * recomputed navigability, so a repair can never sever the sea route it needs).
 * Bounded (≤ 8×8 candidate pairs), draws nothing from the RNG, and touches the
 * map only when the guarantee actually fails — healthy generation output is
 * byte-identical to a build without this pass. Throws if no candidate works:
 * an impossible board must fail loudly at generation, not surface as a
 * conquest-inert map in play.
 */
function ensureLandAssaultRoute(map: GameMap, port: Coord): void {
  let navigable = navigableWaterTiles(map, map.startPositions)
  if (hasLandAssaultRoute(map, port, navigable)) return

  const island = map.tiles[tileIndex(map, port.x, port.y)]!.island
  const isStart = (c: Coord) => map.startPositions.some((s) => s.x === c.x && s.y === c.y)
  const convertible = (c: Coord) => isWaterTile(tileAt(map, c)) && !isStart(c)

  for (const firstStep of mapNeighbors(map, port)) {
    if (!convertible(firstStep)) continue
    for (const secondStep of mapNeighbors(map, firstStep)) {
      if (mapDistance(map, secondStep, port) <= 1 || !convertible(secondStep)) continue
      const tiles = [firstStep, secondStep].map((c) => map.tiles[tileIndex(map, c.x, c.y)]!)
      const saved = tiles.map((t) => ({ ...t }))
      for (const t of tiles) {
        t.type = 'land'
        t.island = island
      }
      navigable = navigableWaterTiles(map, map.startPositions)
      // A repair must never buy the guarantee by sealing a strait: every start
      // must stay sea-reachable from the first (the map validator's contract).
      const fromFirst = navigableWaterTiles(map, [map.startPositions[0]!])
      const seaIntact = map.startPositions.every((s) => fromFirst.has(tileIndex(map, s.x, s.y)))
      if (seaIntact && hasLandAssaultRoute(map, port, navigable)) {
        // Local coastline fix-up: the new land's deep neighbours become shallows,
        // matching the generator's coastline pass.
        for (const c of [firstStep, secondStep]) {
          for (const n of mapNeighbors(map, c)) {
            const tile = map.tiles[tileIndex(map, n.x, n.y)]!
            if (tile.type === 'deep') tile.type = 'shallows'
          }
        }
        return
      }
      tiles.forEach((t, i) => {
        t.type = saved[i]!.type
        t.island = saved[i]!.island
      })
    }
  }
  throw new Error(
    `Cannot guarantee a land-assault route for the capital at ${port.x},${port.y} — ` +
      'no two-tile land bridge restores an overland approach',
  )
}

function nearestLandToCenter(
  map: GameMap,
  islandCenter: Coord,
  island: number,
  center: Coord,
): Coord {
  let best: Coord = islandCenter
  let bestDist = Infinity
  for (let y = 0; y < map.height; y++) {
    for (let x = 0; x < map.width; x++) {
      const tile = map.tiles[tileIndex(map, x, y)]!
      if (tile.island !== island || tile.type !== 'land') continue
      const d = (x - center.x) ** 2 + (y - center.y) ** 2
      if (d < bestDist) {
        bestDist = d
        best = { x, y }
      }
    }
  }
  return best
}

function waterAdjacentTowardCenter(map: GameMap, port: Coord, center: Coord): Coord {
  let best: Coord | undefined
  let bestDist = Infinity
  for (const n of mapNeighbors(map, port)) {
    if (!isWaterTile(tileAt(map, n))) continue
    const d = (n.x - center.x) ** 2 + (n.y - center.y) ** 2
    if (d < bestDist) {
      bestDist = d
      best = n
    }
  }
  // Guaranteed to exist: home islands are small discs surrounded by open sea.
  if (!best) throw new Error('port has no adjacent water tile')
  return best
}
