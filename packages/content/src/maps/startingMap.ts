/**
 * Canonical authored starting map (#348, Phase 3).
 *
 * A hand-authored two-player `MapDefinition` (#62) — the same shape
 * `createGame` accepts for a generated map, but built here so a fixed layout
 * (ports, resource nodes, encounters) can migrate to hex without depending on
 * the seeded generator (@aop/content cannot import @aop/engine; see hexMap.ts).
 *
 * Layout: a `MAP_SIZE`×`MAP_SIZE` sea with one home ISLAND per player on the
 * main diagonal, flanking the centre — a solid radius-`HOME_ISLAND_RADIUS`
 * disc with the port on its centre-facing rim — plus the familiar scatter of
 * resource nodes and encounters (one of each kind) on the open water between
 * them. The original authored map had single-TILE port islands with zero land,
 * which made it conquest-inert (D-039: landing parties were structurally
 * impossible). The 4x-area map quadrupling (operator directive, 2026-07-14)
 * doubled its dimensions and gave each capital a real island, so it now meets
 * the land-assault guarantee every generated map is held to: a party can come
 * ashore beyond the city's rim and march overland to assault it (see
 * `hasLandAssaultRoute` in @aop/engine and the property test in
 * packages/engine/test/landAssaultGuarantee.test.ts).
 *
 * Port spacing is a MEASURED choice, not an accident of scaling. Sweeping the
 * island positions along the diagonal on the 96-match conquest battery
 * (conquestReachable.test.ts wiring; `pnpm --filter @aop/tools exec tsx
 * src/land-battery.ts authored`): at the naively-scaled corner spacing (ports
 * ~35 apart) NO match ever assaults a city — the flagships duel mid-sea while
 * garrisons outgrow the AI's attrition floor, and conquest is structurally
 * dead; at ~19 apart, 9 captures across the battery; at ~15 apart (this
 * layout), 69 captures with 24 by landing party, 18 repelled sea assaults,
 * and 72/96 matches sustaining multi-wave sieges — the conquest-reachable
 * regime the pre-quadrupling map delivered (#453/#462/#471), now with the
 * land vector carrying a third of the captures. The corners stay open ocean.
 *
 * Home-island ports sit on the disc rim with the start position on a cardinal
 * (not diagonal) offset (`{x: port.x + 1, y: port.y}` etc.) — the one offset
 * pair whose adjacency survives hex reinterpretation regardless of row parity
 * (see hex.ts's `NEIGHBORS_EVEN_ROW`/`NEIGHBORS_ODD_ROW`: `{col: ±1, row: 0}`
 * and `{col: 0, row: ±1}` appear in both tables; only the diagonal pair
 * differs). That is what lets `startingMapHex.ts` reuse this layout verbatim
 * instead of hand-tuning start positions per topology. The discs themselves
 * are likewise hex-safe: a solid disc is connected under cardinal moves alone,
 * and every cardinal pair is hex-adjacent in both row parities.
 *
 * `MAP_SIZE` matches `MAP_DIMENSIONS.small` (@aop/engine map.ts) — the
 * authored map plays at the same scale as the smallest generated preset, and
 * sits well inside @aop/content's `MAP_VALIDATION_LIMITS` (24..96).
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

export const MAP_SIZE = 48

/** Radius of each home-island disc (matches the generated small/medium/large radius). */
const HOME_ISLAND_RADIUS = 3

/** Disc centres sit inland of their port, which faces the map centre. */
const ISLANDS: { center: { x: number; y: number }; port: { x: number; y: number } }[] = [
  { center: { x: 14, y: 14 }, port: { x: 16, y: 16 } },
  { center: { x: 33, y: 33 }, port: { x: 31, y: 31 } },
]

function buildTiles(): StartingMapDefinition['tiles'] {
  const tiles: StartingMapDefinition['tiles'] = Array.from({ length: MAP_SIZE * MAP_SIZE }, () => ({
    type: 'deep' as StartingMapTileType,
    island: -1,
  }))
  const at = (x: number, y: number) => y * MAP_SIZE + x
  ISLANDS.forEach(({ center, port }, island) => {
    for (let dy = -HOME_ISLAND_RADIUS; dy <= HOME_ISLAND_RADIUS; dy++) {
      for (let dx = -HOME_ISLAND_RADIUS; dx <= HOME_ISLAND_RADIUS; dx++) {
        if (dx * dx + dy * dy > HOME_ISLAND_RADIUS * HOME_ISLAND_RADIUS) continue
        tiles[at(center.x + dx, center.y + dy)] = { type: 'land', island }
      }
    }
    tiles[at(port.x, port.y)] = { type: 'port', island }
  })
  // Coastline, mirroring the generator: any deep tile touching land becomes
  // shallows. The 8-neighbourhood is a superset of both hex parities'
  // 6-neighbourhoods, so the hex reinterpretation keeps land off deep water too.
  for (let y = 0; y < MAP_SIZE; y++) {
    for (let x = 0; x < MAP_SIZE; x++) {
      if (tiles[at(x, y)]!.type !== 'deep') continue
      let coastal = false
      for (let dy = -1; dy <= 1 && !coastal; dy++) {
        for (let dx = -1; dx <= 1 && !coastal; dx++) {
          if (dx === 0 && dy === 0) continue
          const nx = x + dx
          const ny = y + dy
          if (nx < 0 || ny < 0 || nx >= MAP_SIZE || ny >= MAP_SIZE) continue
          if (tiles[at(nx, ny)]!.type === 'land') coastal = true
        }
      }
      if (coastal) tiles[at(x, y)]!.type = 'shallows'
    }
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
    { x: ISLANDS[0]!.port.x + 1, y: ISLANDS[0]!.port.y },
    { x: ISLANDS[1]!.port.x - 1, y: ISLANDS[1]!.port.y },
  ],
  // The pre-quadrupling scatter, scaled by 2 with the board.
  resourceNodes: [
    { kind: 'gold', position: { x: 20, y: 20 }, ownerSeat: 0 },
    { kind: 'timber', position: { x: 28, y: 16 } },
    { kind: 'iron', position: { x: 18, y: 30 } },
    { kind: 'rum', position: { x: 30, y: 18 } },
  ],
  encounters: [
    { kind: 'merchant', position: { x: 24, y: 24 } },
    { kind: 'natives', position: { x: 12, y: 36 } },
    { kind: 'settlers', position: { x: 34, y: 10 } },
  ],
}
