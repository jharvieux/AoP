/**
 * Integer hex-grid math for the tactical battle board (#39).
 *
 * The board is a rectangle of pointy-top hexes addressed by odd-r offset
 * coordinates `{ col, row }` (odd rows shove right) — the natural fit for a
 * rectangular battlefield that serializes as a flat array. Distance runs
 * through axial/cube conversion. Everything here is integer arithmetic: hex
 * positions never touch floating point, which keeps board state and replays
 * bit-exact across machines.
 */

export interface HexCoord {
  col: number
  row: number
}

/** Neighbor offsets for pointy-top odd-r hexes, keyed by row parity. */
const NEIGHBORS_EVEN_ROW: readonly HexCoord[] = [
  { col: 1, row: 0 },
  { col: 0, row: -1 },
  { col: -1, row: -1 },
  { col: -1, row: 0 },
  { col: -1, row: 1 },
  { col: 0, row: 1 },
]
const NEIGHBORS_ODD_ROW: readonly HexCoord[] = [
  { col: 1, row: 0 },
  { col: 1, row: -1 },
  { col: 0, row: -1 },
  { col: -1, row: 0 },
  { col: 0, row: 1 },
  { col: 1, row: 1 },
]

/** The (up to) six neighbors of a hex that fall inside a `width`×`height` board. */
export function hexNeighbors(hex: HexCoord, width: number, height: number): HexCoord[] {
  const offsets = hex.row % 2 === 0 ? NEIGHBORS_EVEN_ROW : NEIGHBORS_ODD_ROW
  const out: HexCoord[] = []
  for (const d of offsets) {
    const col = hex.col + d.col
    const row = hex.row + d.row
    if (col >= 0 && col < width && row >= 0 && row < height) out.push({ col, row })
  }
  return out
}

/** Odd-r offset → axial q (r is the row itself). Integer for integer inputs. */
function axialQ(hex: HexCoord): number {
  return hex.col - (hex.row - (hex.row & 1)) / 2
}

/** Hex distance between two odd-r offset coordinates. */
export function hexDistance(a: HexCoord, b: HexCoord): number {
  const aq = axialQ(a)
  const bq = axialQ(b)
  const dq = aq - bq
  const dr = a.row - b.row
  return (Math.abs(dq) + Math.abs(dr) + Math.abs(dq + dr)) / 2
}

export function hexEquals(a: HexCoord, b: HexCoord): boolean {
  return a.col === b.col && a.row === b.row
}

/** Flat-array index of a hex on a `width`-column board. */
export function hexIndex(hex: HexCoord, width: number): number {
  return hex.row * width + hex.col
}

export function hexFromIndex(index: number, width: number): HexCoord {
  return { col: index % width, row: Math.floor(index / width) }
}
