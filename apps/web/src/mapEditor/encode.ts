import type { EncounterKind, Tile, TileType } from '@aop/engine'
import type { Coord } from '@aop/shared'
import { newDraftId } from './draft'
import type { EditorDraft, ResourceMarkerKind } from './types'

/**
 * Tier-1 map sharing (#63): a compact, versioned, offline shareable "map code"
 * for an `EditorDraft` — no backend required. Import re-validates via the
 * engine's `validateMapDefinition` before the caller accepts it (see
 * MapEditorScreen), so a hand-edited or corrupted code can't produce an
 * unplayable match. Tile data is run-length encoded (large uniform sea/land
 * regions compress well) before base64-wrapping the JSON payload.
 */

const CODE_PREFIX = 'AOPMAP1:'

const TYPE_CODE: Record<TileType, string> = { deep: 'd', shallows: 's', land: 'l', port: 'p' }
const CODE_TYPE: Record<string, TileType> = { d: 'deep', s: 'shallows', l: 'land', p: 'port' }

type TileRun = [code: string, island: number, count: number]

function encodeTilesRLE(tiles: readonly Tile[]): TileRun[] {
  const runs: TileRun[] = []
  for (const tile of tiles) {
    const code = TYPE_CODE[tile.type]
    const last = runs[runs.length - 1]
    if (last && last[0] === code && last[1] === tile.island) {
      last[2]++
    } else {
      runs.push([code, tile.island, 1])
    }
  }
  return runs
}

function decodeTilesRLE(runs: TileRun[], expectedCount: number): Tile[] {
  const tiles: Tile[] = []
  for (const [code, island, count] of runs) {
    const type = CODE_TYPE[code]
    if (!type) throw new Error(`Invalid map code: unknown tile type "${code}"`)
    if (!Number.isInteger(count) || count < 0) {
      throw new Error('Invalid map code: malformed tile run')
    }
    for (let i = 0; i < count; i++) tiles.push({ type, island })
  }
  if (tiles.length !== expectedCount) {
    throw new Error(
      `Invalid map code: decoded ${tiles.length} tiles, expected ${expectedCount} for the declared dimensions`,
    )
  }
  return tiles
}

interface WireFormatV1 {
  v: 1
  name: string
  width: number
  height: number
  runs: TileRun[]
  startPositions: Coord[]
  encounters: { kind: EncounterKind; position: Coord }[]
  resourceMarkers: { kind: ResourceMarkerKind; position: Coord }[]
}

// `btoa`/`atob` operate on binary strings (one char per byte), so unicode map
// names round-trip through UTF-8 bytes first — plain `btoa(json)` would throw
// on any non-Latin1 character. Both browsers and Node >=20 (this repo's floor,
// see package.json engines) expose btoa/atob as globals.
function toBase64(text: string): string {
  const bytes = new TextEncoder().encode(text)
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary)
}

function fromBase64(b64: string): string {
  const binary = atob(b64)
  const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0))
  return new TextDecoder().decode(bytes)
}

export function encodeMapCode(draft: EditorDraft): string {
  const wire: WireFormatV1 = {
    v: 1,
    name: draft.name,
    width: draft.width,
    height: draft.height,
    runs: encodeTilesRLE(draft.tiles),
    startPositions: draft.startPositions,
    encounters: draft.encounters,
    resourceMarkers: draft.resourceMarkers,
  }
  return `${CODE_PREFIX}${toBase64(JSON.stringify(wire))}`
}

export function decodeMapCode(code: string): EditorDraft {
  const trimmed = code.trim()
  if (!trimmed.startsWith(CODE_PREFIX)) {
    throw new Error('Unrecognized map code — expected a code starting with "AOPMAP1:"')
  }
  let wire: WireFormatV1
  try {
    wire = JSON.parse(fromBase64(trimmed.slice(CODE_PREFIX.length))) as WireFormatV1
  } catch {
    throw new Error('Invalid map code: could not decode payload')
  }
  if (wire.v !== 1) {
    throw new Error(`Unsupported map code version ${String(wire.v)}`)
  }
  if (
    typeof wire.width !== 'number' ||
    typeof wire.height !== 'number' ||
    !Array.isArray(wire.runs)
  ) {
    throw new Error('Invalid map code: missing required fields')
  }
  const tiles = decodeTilesRLE(wire.runs, wire.width * wire.height)
  return {
    id: newDraftId(),
    name: wire.name ?? 'Imported map',
    width: wire.width,
    height: wire.height,
    tiles,
    startPositions: wire.startPositions ?? [],
    encounters: wire.encounters ?? [],
    resourceMarkers: wire.resourceMarkers ?? [],
  }
}
