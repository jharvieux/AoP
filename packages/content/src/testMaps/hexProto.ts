/**
 * Disposable hex-prototype test map (#348, Phase 1).
 *
 * A fixed 15×15 board of pointy-top hexes addressed by odd-r offset
 * coordinates `(col, row)`, stored row-major. Terrain only — no resources,
 * encounters, or start positions. It exists solely to exercise hex
 * adjacency/pathfinding in `@aop/engine` and is deleted wholesale if the hex
 * conversion is rejected. NOT referenced by any live map, GameState, or the
 * reducer.
 *
 * Legend: `L` land (passable, cost 1) · `W` water (impassable) ·
 * `M` mountain (impassable). Obstacles are placed so the straight line from
 * (0,0) to (10,5) is blocked by both the north lake and the central mountain
 * ridge, forcing the pathfinder to prove a genuine detour.
 */

export type HexTerrain = 'land' | 'water' | 'mountain'

export const HEX_PROTO_WIDTH = 15
export const HEX_PROTO_HEIGHT = 15

const ROWS: readonly string[] = [
  'LLLLLLLLLLLLLLL',
  'LLLWWWLLLLLLLLL',
  'LLWWWWWLLLMMLLL',
  'LLWWWWWLLMMMLLL',
  'LLLWWWLLLMMLLLL',
  'LLLLLLLLMMLLLLL',
  'LLLLLLLMMLLLLWW',
  'LLLMMLLLLLLWWWW',
  'LLMMMMLLLLWWWWL',
  'LLLMMLLLLLWWLLL',
  'LLLLLLLLLLLLLLL',
  'LLLWWWWLLLLLLLL',
  'LLWWWWWWLLMMMLL',
  'LLLWWWWLLLMMLLL',
  'LLLLLLLLLLLLLLL',
]

const TERRAIN_BY_CHAR: Record<string, HexTerrain> = {
  L: 'land',
  W: 'water',
  M: 'mountain',
}

function parseRows(rows: readonly string[]): HexTerrain[] {
  if (rows.length !== HEX_PROTO_HEIGHT) {
    throw new Error(`hexProto: expected ${HEX_PROTO_HEIGHT} rows, got ${rows.length}`)
  }
  const terrain: HexTerrain[] = []
  for (const row of rows) {
    if (row.length !== HEX_PROTO_WIDTH) {
      throw new Error(`hexProto: expected ${HEX_PROTO_WIDTH} cols, got ${row.length}`)
    }
    for (const ch of row) {
      const t = TERRAIN_BY_CHAR[ch]
      if (!t) throw new Error(`hexProto: unknown terrain char '${ch}'`)
      terrain.push(t)
    }
  }
  return terrain
}

/** Row-major terrain, length `HEX_PROTO_WIDTH * HEX_PROTO_HEIGHT`. */
export const HEX_PROTO_TERRAIN: readonly HexTerrain[] = parseRows(ROWS)

export function hexProtoTerrainAt(col: number, row: number): HexTerrain | undefined {
  if (col < 0 || col >= HEX_PROTO_WIDTH || row < 0 || row >= HEX_PROTO_HEIGHT) return undefined
  return HEX_PROTO_TERRAIN[row * HEX_PROTO_WIDTH + col]
}
