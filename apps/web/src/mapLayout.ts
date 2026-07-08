import { cartToHex, cubeToOffset, hexToCart, offsetToCube, type GridTopology } from '@aop/engine'
import type { Coord } from '@aop/shared'

/**
 * Pure, framework-free screen ↔ grid geometry for MapCanvas / Minimap (#348,
 * Phase 4). Kept out of MapCanvas so the topology math is unit-testable without
 * a Pixi/canvas environment — the same split as mapCursor.ts / mapSprites.ts /
 * shipAnimation.ts.
 *
 * The square path is deliberately byte-identical to the arithmetic MapCanvas
 * used before this module existed: `cellCenter` returns `x*tileSize + tileSize/2`
 * and `pixelToCell` returns `floor(px / tileSize)`, so square-grid rendering and
 * input are unchanged. The hex path composes the engine's cube-coordinate hex
 * math (`offsetToCube`/`hexToCart` and their inverses) — float lives only here at
 * the render/input boundary and feeds integer rounding, never engine state.
 *
 * Hex convention: pointy-top, odd-r offset (`x` = col, `y` = row), matching the
 * engine's `mapNeighbors`/`mapDistance` interpretation of a hex `GameMap`.
 */

const SQRT3 = Math.sqrt(3)

/**
 * Centre-to-corner radius of a rendered pointy-top hex, chosen so a hex is
 * exactly `tileSize` wide (`SQRT3 * size = tileSize`). This keeps a bridged hex
 * map's pixel extent close to the square map it came from, so camera defaults,
 * zoom limits, and the initial view carry over without retuning.
 */
export function hexSize(tileSize: number): number {
  return tileSize / SQRT3
}

/**
 * Pixel offset applied to every hex centre so tile (0,0) sits fully in the
 * positive quadrant — its centre is half a hex-width right of, and one radius
 * below, the origin, so the whole hex is at x,y ≥ 0 (parity with the square
 * grid, whose tile (0,0) spans [0, tileSize)²).
 */
function hexOrigin(tileSize: number): Coord {
  const s = hexSize(tileSize)
  return { x: (SQRT3 * s) / 2, y: s }
}

/**
 * Pixel centre of tile `(x, y)` under `topology`. Square: the tile's midpoint
 * (identical to MapCanvas's prior inline math). Hex: the odd-r pointy-top layout
 * via the engine's `hexToCart`, scaled to `hexSize(tileSize)`.
 */
export function cellCenter(topology: GridTopology, x: number, y: number, tileSize: number): Coord {
  if (topology === 'hex') {
    const s = hexSize(tileSize)
    const o = hexOrigin(tileSize)
    const c = hexToCart(offsetToCube({ col: x, row: y }))
    return { x: c.x * s + o.x, y: c.y * s + o.y }
  }
  return { x: x * tileSize + tileSize / 2, y: y * tileSize + tileSize / 2 }
}

/**
 * The grid coord whose cell contains pixel `(px, py)` — the inverse of
 * {@link cellCenter}. The result may be out of the map's bounds; callers
 * validate against the map dimensions before acting on it.
 */
export function pixelToCell(
  topology: GridTopology,
  px: number,
  py: number,
  tileSize: number,
): Coord {
  if (topology === 'hex') {
    const s = hexSize(tileSize)
    const o = hexOrigin(tileSize)
    const off = cubeToOffset(cartToHex({ x: (px - o.x) / s, y: (py - o.y) / s }))
    return { x: off.col, y: off.row }
  }
  return { x: Math.floor(px / tileSize), y: Math.floor(py / tileSize) }
}

/**
 * Corner points `[x0, y0, x1, y1, …]` of the pointy-top hexagon centred at
 * `(cx, cy)` with the given centre-to-corner `size`, wound so the flat sides
 * face left/right and the points face up/down — the boundary that matches
 * {@link cellCenter}'s hex spacing (redblobgames pointy-top corners).
 */
export function hexCorners(cx: number, cy: number, size: number): number[] {
  const pts: number[] = []
  for (let i = 0; i < 6; i++) {
    const angle = (Math.PI / 180) * (60 * i - 30)
    pts.push(cx + size * Math.cos(angle), cy + size * Math.sin(angle))
  }
  return pts
}

/**
 * Polygon outline of tile `(x, y)`'s cell as a flat point list. Square returns
 * the four axis-aligned corners; hex returns the six hexagon corners. Used for
 * the hex-only cosmetic tile boundary (square keeps drawing an axis-aligned
 * `rect` for byte-identical output).
 */
export function cellPolygon(
  topology: GridTopology,
  x: number,
  y: number,
  tileSize: number,
): number[] {
  const c = cellCenter(topology, x, y, tileSize)
  if (topology === 'hex') return hexCorners(c.x, c.y, hexSize(tileSize))
  const half = tileSize / 2
  return [
    c.x - half,
    c.y - half,
    c.x + half,
    c.y - half,
    c.x + half,
    c.y + half,
    c.x - half,
    c.y + half,
  ]
}

/**
 * The full map's pixel extent under `topology`. Square: `width×height` tiles.
 * Hex: the bounding box of every hex cell (odd rows push the right edge out by
 * half a hex width; the last row plus a corner radius set the bottom edge). Used
 * by the minimap to scale the whole map into a fixed width.
 */
export function mapPixelExtent(
  topology: GridTopology,
  width: number,
  height: number,
  tileSize: number,
): { width: number; height: number } {
  if (topology !== 'hex') {
    return { width: width * tileSize, height: height * tileSize }
  }
  const s = hexSize(tileSize)
  const halfW = (SQRT3 * s) / 2
  // Odd rows shove right by half a hex width, so the widest centre is in an odd
  // row when one exists; otherwise the single even row.
  const rightRow = height > 1 ? 1 : 0
  const right = cellCenter('hex', width - 1, rightRow, tileSize).x + halfW
  const bottom = cellCenter('hex', 0, height - 1, tileSize).y + s
  return { width: right, height: bottom }
}

/**
 * The inclusive range of tile coords that can be on screen, clamped to the map.
 * Square reproduces MapCanvas's prior culling window exactly (1-tile pad). Hex
 * inverse-projects the four viewport corners to cells and pads by 2 to cover the
 * offset-row stagger and partially-visible edge hexes.
 */
export function visibleCellBounds(
  topology: GridTopology,
  map: { width: number; height: number },
  view: { x: number; y: number; scale: number },
  viewportWidth: number,
  viewportHeight: number,
  tileSize: number,
): { minX: number; minY: number; maxX: number; maxY: number } {
  if (topology !== 'hex') {
    return {
      minX: Math.max(0, Math.floor(-view.x / view.scale / tileSize) - 1),
      minY: Math.max(0, Math.floor(-view.y / view.scale / tileSize) - 1),
      maxX: Math.min(
        map.width - 1,
        Math.ceil((viewportWidth - view.x) / view.scale / tileSize) + 1,
      ),
      maxY: Math.min(
        map.height - 1,
        Math.ceil((viewportHeight - view.y) / view.scale / tileSize) + 1,
      ),
    }
  }
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  const corners: readonly [number, number][] = [
    [0, 0],
    [viewportWidth, 0],
    [0, viewportHeight],
    [viewportWidth, viewportHeight],
  ]
  for (const [sx, sy] of corners) {
    const cell = pixelToCell(
      'hex',
      (sx - view.x) / view.scale,
      (sy - view.y) / view.scale,
      tileSize,
    )
    minX = Math.min(minX, cell.x)
    minY = Math.min(minY, cell.y)
    maxX = Math.max(maxX, cell.x)
    maxY = Math.max(maxY, cell.y)
  }
  return {
    minX: Math.max(0, minX - 2),
    minY: Math.max(0, minY - 2),
    maxX: Math.min(map.width - 1, maxX + 2),
    maxY: Math.min(map.height - 1, maxY + 2),
  }
}
