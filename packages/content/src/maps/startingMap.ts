/**
 * Canonical authored starting map (#348, Phase 3).
 *
 * A hand-authored two-player `MapDefinition` (#62) — the same shape
 * `createGame` accepts for a generated map, but built here so a fixed layout
 * (ports, resource nodes, encounters) can migrate to hex without depending on
 * the seeded generator (@aop/content cannot import @aop/engine; see hexMap.ts).
 *
 * Layout: an otherwise-empty `MAP_SIZE`×`MAP_SIZE` sea with one single-tile
 * home island per player at opposite corners, plus a scatter of resource
 * nodes and encounters (one of each kind) on the open water between them.
 * Every non-port coordinate is `deep` water, so the map is trivially
 * connected and every authored position is legal on both a square and a hex
 * interpretation of the same coordinates.
 *
 * Home islands sit on cardinal (not diagonal) offsets from their port
 * (`{x: port.x + 1, y: port.y}` etc.) — the one offset pair whose adjacency
 * survives hex reinterpretation regardless of row parity (see hex.ts's
 * `NEIGHBORS_EVEN_ROW`/`NEIGHBORS_ODD_ROW`: `{col: ±1, row: 0}` and
 * `{col: 0, row: ±1}` appear in both tables; only the diagonal pair differs).
 * That is what lets `startingMapHex.ts` reuse this layout verbatim instead of
 * hand-tuning start positions per topology.
 *
 * `MAP_SIZE` matches @aop/content's own `MAP_VALIDATION_LIMITS.minSize` (see
 * tuning.ts) so this authored map sits at the same floor a generated map
 * would.
 */

export type StartingMapTileType = 'deep' | 'shallows' | 'land' | 'port'
export type StartingMapEncounterKind = 'merchant' | 'natives' | 'settlers'
export type StartingMapResourceNodeKind = 'gold' | 'timber' | 'iron' | 'rum'

export interface StartingMapDefinition {
  width: number
  height: number
  tiles: { type: StartingMapTileType; island: number }[]
  startPositions: { x: number; y: number }[]
  topology?: 'square' | 'hex'
  encounters: { kind: StartingMapEncounterKind; position: { x: number; y: number } }[]
  resourceNodes: {
    kind: StartingMapResourceNodeKind
    position: { x: number; y: number }
    ownerSeat?: number
  }[]
}

export const MAP_SIZE = 24

const PORTS: { x: number; y: number; island: number }[] = [
  { x: 3, y: 3, island: 0 },
  { x: 20, y: 20, island: 1 },
]

function buildTiles(): StartingMapDefinition['tiles'] {
  const tiles: StartingMapDefinition['tiles'] = Array.from({ length: MAP_SIZE * MAP_SIZE }, () => ({
    type: 'deep' as StartingMapTileType,
    island: -1,
  }))
  for (const port of PORTS) {
    tiles[port.y * MAP_SIZE + port.x] = { type: 'port', island: port.island }
  }
  return tiles
}

/**
 * The canonical square-grid starting map. `topology` is omitted (square is
 * the implicit default — see `GridTopology` in @aop/engine's map.ts).
 */
export const STARTING_MAP: StartingMapDefinition = {
  width: MAP_SIZE,
  height: MAP_SIZE,
  tiles: buildTiles(),
  // Cardinal-adjacent to each port (see file doc comment) so both squads
  // remain coastal under a hex reinterpretation too.
  startPositions: [
    { x: PORTS[0]!.x + 1, y: PORTS[0]!.y },
    { x: PORTS[1]!.x - 1, y: PORTS[1]!.y },
  ],
  resourceNodes: [
    { kind: 'gold', position: { x: 10, y: 10 }, ownerSeat: 0 },
    { kind: 'timber', position: { x: 14, y: 8 } },
    { kind: 'iron', position: { x: 9, y: 15 } },
    { kind: 'rum', position: { x: 15, y: 9 } },
  ],
  encounters: [
    { kind: 'merchant', position: { x: 12, y: 12 } },
    { kind: 'natives', position: { x: 6, y: 18 } },
    { kind: 'settlers', position: { x: 17, y: 5 } },
  ],
}
