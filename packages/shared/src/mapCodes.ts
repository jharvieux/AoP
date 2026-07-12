import type { Coord } from './index'

/**
 * The Tier-1 map-code wire codec (#63): a compact, versioned, offline shareable
 * "map code". Moved here from `apps/web/src/mapEditor/encode.ts` when Tier 2
 * (the community library) arrived, because the publish Edge Function must
 * decode and re-validate every submitted code server-side — never trusting the
 * client's validation — and Edge Functions can import `@aop/shared` but not
 * the web app. The wire format is unchanged: `AOPMAP1:` + base64(JSON) with
 * run-length-encoded tiles.
 *
 * This module is transport only. It guarantees the payload is *structurally*
 * sound (well-formed tiles, integer coordinates, sane dimensions) but knows
 * nothing about game rules — semantic validation (start positions on water,
 * known encounter kinds, connectivity, …) is the engine's
 * `validateMapDefinition`, which every consumer runs on the decoded payload
 * before accepting it.
 *
 * Also carries #197's paste-resilience UX (relocated here for the same
 * reason as the codec itself): all whitespace is stripped before decoding, so
 * a code hard-wrapped by chat/forums/email still imports, and any
 * `AOPMAP<N>:` prefix is recognized even when `N` is a future format version
 * — so a code from a newer game build gets a "update to import this" message
 * instead of a generic "unrecognized code" error.
 */

// Universal web APIs, present in every runtime this repo targets (browsers,
// Deno, Node >= 20 — see package.json engines). Declared module-locally
// because @aop/shared's sources are re-typechecked by consumers whose tsconfig
// lib is pure ES2022 — the engine deliberately excludes DOM to enforce its
// no-host-APIs invariant, and widening ITS lib for this module would weaken
// that guard.
declare function btoa(data: string): string
declare function atob(data: string): string
declare class TextEncoder {
  encode(input?: string): Uint8Array
}
declare class TextDecoder {
  decode(input?: Uint8Array): string
}

const FORMAT_VERSION = 1
export const MAP_CODE_PREFIX = `AOPMAP${FORMAT_VERSION}:`
// Any AOPMAP<N>: prefix is recognized as one of ours even when N is a future
// version — so a code from a newer game build gets a "update to import this"
// message instead of a generic "unrecognized code" error (#197).
const CODE_PATTERN = /^AOPMAP(\d+):/

/**
 * Structural cap on declared map dimensions, well above the engine's playable
 * maximum (48, `MAP_VALIDATION_LIMITS.maxSize` in @aop/content). This is a
 * decode-bomb guard, not a balance rule: without it a tiny hand-forged code
 * declaring a 10^9-wide map would make `decodeMapCodePayload` allocate that
 * many tiles before any semantic validation could reject it.
 */
export const MAP_CODE_MAX_DIMENSION = 512

/** Mirrors the engine's `TileType` literals structurally — `@aop/shared` sits
 * below `@aop/engine` in the dependency graph, so it cannot import them. */
export type MapCodeTileType = 'deep' | 'shallows' | 'land' | 'port'

export interface MapCodeTile {
  type: MapCodeTileType
  island: number
}

/** Entity kinds ride the wire as plain strings; the engine's
 * `validateMapDefinition` rejects unrecognized ones downstream. */
export interface MapCodeEntity {
  kind: string
  position: Coord
}

export interface MapCodePayload {
  name: string
  width: number
  height: number
  /** Row-major, length `width * height` — same layout as the engine's `GameMap.tiles`. */
  tiles: MapCodeTile[]
  startPositions: Coord[]
  encounters: MapCodeEntity[]
  resourceMarkers: MapCodeEntity[]
}

const TYPE_CODE: Record<MapCodeTileType, string> = {
  deep: 'd',
  shallows: 's',
  land: 'l',
  port: 'p',
}
const CODE_TYPE: Record<string, MapCodeTileType> = {
  d: 'deep',
  s: 'shallows',
  l: 'land',
  p: 'port',
}

type TileRun = [code: string, island: number, count: number]

function encodeTilesRLE(tiles: readonly MapCodeTile[]): TileRun[] {
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

function decodeTilesRLE(runs: TileRun[], expectedCount: number): MapCodeTile[] {
  const tiles: MapCodeTile[] = []
  for (const run of runs) {
    if (!Array.isArray(run)) throw new Error('Invalid map code: malformed tile run')
    const [code, island, count] = run
    const type = CODE_TYPE[code]
    if (!type) throw new Error(`Invalid map code: unknown tile type "${String(code)}"`)
    if (!Number.isInteger(island)) throw new Error('Invalid map code: malformed tile run')
    if (!Number.isInteger(count) || count < 0) {
      throw new Error('Invalid map code: malformed tile run')
    }
    // Enforce the cap BEFORE expanding: a forged run count must not be able to
    // allocate past the declared (already bounds-checked) dimensions.
    if (tiles.length + count > expectedCount) {
      throw new Error(
        `Invalid map code: tile runs exceed the ${expectedCount} tiles the declared dimensions allow`,
      )
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

// `btoa`/`atob` operate on binary strings (one char per byte), so unicode map
// names round-trip through UTF-8 bytes first — plain `btoa(json)` would throw
// on any non-Latin1 character. Browsers, Deno, and Node >=20 (this repo's
// floor, see package.json engines) all expose btoa/atob as globals.
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

/** UTF-8 byte length of a string — the unit size caps are measured in. */
export function utf8ByteLength(text: string): number {
  return new TextEncoder().encode(text).length
}

interface WireFormatV1 {
  v: 1
  name: string
  width: number
  height: number
  runs: TileRun[]
  startPositions: Coord[]
  encounters: MapCodeEntity[]
  resourceMarkers: MapCodeEntity[]
}

export function encodeMapCodePayload(payload: MapCodePayload): string {
  const wire: WireFormatV1 = {
    v: 1,
    name: payload.name,
    width: payload.width,
    height: payload.height,
    runs: encodeTilesRLE(payload.tiles),
    startPositions: payload.startPositions,
    encounters: payload.encounters,
    resourceMarkers: payload.resourceMarkers,
  }
  return `${MAP_CODE_PREFIX}${toBase64(JSON.stringify(wire))}`
}

function isCoord(value: unknown): value is Coord {
  if (typeof value !== 'object' || value === null) return false
  const c = value as { x?: unknown; y?: unknown }
  return Number.isInteger(c.x) && Number.isInteger(c.y)
}

function decodeEntityList(raw: unknown, label: string): MapCodeEntity[] {
  if (raw === undefined || raw === null) return []
  if (!Array.isArray(raw)) throw new Error(`Invalid map code: malformed ${label}`)
  return raw.map((entry) => {
    const e = entry as { kind?: unknown; position?: unknown }
    if (typeof e?.kind !== 'string' || !isCoord(e.position)) {
      throw new Error(`Invalid map code: malformed ${label}`)
    }
    return { kind: e.kind, position: { x: e.position.x, y: e.position.y } }
  })
}

/**
 * Decode and structurally validate a map code. Throws a descriptive `Error`
 * on anything malformed — this is an untrusted-input boundary on both ends
 * (hand-edited codes on import, hostile clients on publish).
 */
export function decodeMapCodePayload(code: string): MapCodePayload {
  // Strip ALL whitespace, not just the ends: codes pasted from chat, forums,
  // or email often arrive hard-wrapped, and neither the prefix nor base64
  // legitimately contains whitespace (#197).
  const compact = code.replace(/\s+/g, '')
  const versionMatch = CODE_PATTERN.exec(compact)
  if (!versionMatch) {
    throw new Error(`Unrecognized map code — expected a code starting with "${MAP_CODE_PREFIX}"`)
  }
  const codeVersion = Number(versionMatch[1])
  if (codeVersion > FORMAT_VERSION) {
    throw new Error(
      `This map code uses format v${codeVersion}, from a newer version of Age of Plunder — update the game to import it.`,
    )
  }
  let wire: WireFormatV1
  try {
    wire = JSON.parse(fromBase64(compact.slice(versionMatch[0].length))) as WireFormatV1
  } catch {
    throw new Error('Invalid map code: could not decode payload')
  }
  if (wire.v !== codeVersion) {
    throw new Error(`Unsupported map code version ${String(wire.v)}`)
  }
  if (
    !Number.isInteger(wire.width) ||
    !Number.isInteger(wire.height) ||
    !Array.isArray(wire.runs)
  ) {
    throw new Error('Invalid map code: missing required fields')
  }
  if (
    wire.width < 1 ||
    wire.height < 1 ||
    wire.width > MAP_CODE_MAX_DIMENSION ||
    wire.height > MAP_CODE_MAX_DIMENSION
  ) {
    throw new Error(
      `Invalid map code: dimensions ${wire.width}x${wire.height} are outside 1..${MAP_CODE_MAX_DIMENSION}`,
    )
  }
  const tiles = decodeTilesRLE(wire.runs, wire.width * wire.height)

  const rawStarts = wire.startPositions ?? []
  if (!Array.isArray(rawStarts) || !rawStarts.every(isCoord)) {
    throw new Error('Invalid map code: malformed start positions')
  }

  return {
    name: typeof wire.name === 'string' ? wire.name : 'Imported map',
    width: wire.width,
    height: wire.height,
    tiles,
    startPositions: rawStarts.map((c) => ({ x: c.x, y: c.y })),
    encounters: decodeEntityList(wire.encounters, 'encounters'),
    resourceMarkers: decodeEntityList(wire.resourceMarkers, 'resource markers'),
  }
}
