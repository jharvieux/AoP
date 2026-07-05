import {
  generateMap,
  mapToDefinition,
  MAP_DIMENSIONS,
  type EncounterKind,
  type MapDefinition,
  type TileType,
} from '@aop/engine'
import type { Coord, MapSize } from '@aop/shared'
import type { EditorDraft, ResourceMarkerKind } from './types'

/** Pure editing operations over an `EditorDraft`. Every function returns a new
 * draft (immutable updates) so React state and undo/redo (if ever added) stay
 * simple — no function here touches the DOM, canvas, or storage. */

const MAX_PLAYERS = 8

function coordKey(c: Coord): string {
  return `${c.x},${c.y}`
}

function inBoundsDraft(draft: EditorDraft, c: Coord): boolean {
  return c.x >= 0 && c.y >= 0 && c.x < draft.width && c.y < draft.height
}

/** Unique-enough id for a local draft's storage key — no server, no collision
 * risk that matters, just something stable across renames. */
export function newDraftId(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `draft-${Date.now()}-${Math.floor(Math.random() * 1e9)}`
}

export function blankDraft(size: MapSize = 'small', name = 'Untitled map'): EditorDraft {
  const dim = MAP_DIMENSIONS[size]
  return {
    id: newDraftId(),
    name,
    width: dim,
    height: dim,
    tiles: Array.from({ length: dim * dim }, () => ({ type: 'deep' as TileType, island: -1 })),
    startPositions: [],
    encounters: [],
    resourceMarkers: [],
  }
}

/** The "generate random, then sculpt" flow (#41): snapshot a seeded `generateMap()`
 * output into an editable draft, discarding no geometry (encounters/markers start empty —
 * generated maps carry no author-placed entities). */
export function draftFromGenerated(
  seed: number,
  size: MapSize,
  playerCount: number,
  homeIslandRadius: number,
  name: string,
): EditorDraft {
  const def = mapToDefinition(generateMap(seed, size, playerCount, homeIslandRadius))
  return {
    id: newDraftId(),
    name,
    width: def.width,
    height: def.height,
    tiles: def.tiles,
    startPositions: def.startPositions,
    encounters: [],
    resourceMarkers: [],
  }
}

export function renameDraft(draft: EditorDraft, name: string): EditorDraft {
  return { ...draft, name }
}

export function paintTile(draft: EditorDraft, coord: Coord, type: TileType): EditorDraft {
  if (!inBoundsDraft(draft, coord)) return draft
  const idx = coord.y * draft.width + coord.x
  const current = draft.tiles[idx]!
  if (current.type === type) return draft
  const tiles = draft.tiles.slice()
  tiles[idx] = { type, island: current.island }
  return { ...draft, tiles }
}

/** Flood-fill (4-directional) the contiguous region sharing the clicked tile's
 * original type, repainting it to `type`. A no-op if the region is already `type`. */
export function floodFillTile(draft: EditorDraft, coord: Coord, type: TileType): EditorDraft {
  if (!inBoundsDraft(draft, coord)) return draft
  const startIdx = coord.y * draft.width + coord.x
  const target = draft.tiles[startIdx]!.type
  if (target === type) return draft

  const tiles = draft.tiles.map((t) => ({ ...t }))
  const stack = [startIdx]
  const visited = new Set<number>()
  while (stack.length > 0) {
    const idx = stack.pop()!
    if (visited.has(idx) || tiles[idx]!.type !== target) continue
    visited.add(idx)
    tiles[idx]!.type = type
    const x = idx % draft.width
    const y = Math.floor(idx / draft.width)
    const neighbors: Coord[] = [
      { x: x + 1, y },
      { x: x - 1, y },
      { x, y: y + 1 },
      { x, y: y - 1 },
    ]
    for (const n of neighbors) {
      if (!inBoundsDraft(draft, n)) continue
      const nIdx = n.y * draft.width + n.x
      if (!visited.has(nIdx) && tiles[nIdx]!.type === target) stack.push(nIdx)
    }
  }
  return { ...draft, tiles }
}

/** True if any entity (start position, encounter, or resource marker) already
 * occupies `coord` — placement tools refuse to stack entities on one tile. */
export function hasEntityAt(draft: EditorDraft, coord: Coord): boolean {
  const key = coordKey(coord)
  return (
    draft.startPositions.some((s) => coordKey(s) === key) ||
    draft.encounters.some((e) => coordKey(e.position) === key) ||
    draft.resourceMarkers.some((r) => coordKey(r.position) === key)
  )
}

export function addStartPosition(draft: EditorDraft, coord: Coord): EditorDraft {
  if (draft.startPositions.length >= MAX_PLAYERS) return draft
  if (hasEntityAt(draft, coord)) return draft
  return { ...draft, startPositions: [...draft.startPositions, { ...coord }] }
}

export function placeEncounter(draft: EditorDraft, coord: Coord, kind: EncounterKind): EditorDraft {
  if (hasEntityAt(draft, coord)) return draft
  return { ...draft, encounters: [...draft.encounters, { kind, position: { ...coord } }] }
}

export function placeResourceMarker(
  draft: EditorDraft,
  coord: Coord,
  kind: ResourceMarkerKind,
): EditorDraft {
  if (hasEntityAt(draft, coord)) return draft
  return { ...draft, resourceMarkers: [...draft.resourceMarkers, { kind, position: { ...coord } }] }
}

/** Removes whichever entity (start/encounter/marker) sits at `coord`, if any. */
export function eraseEntityAt(draft: EditorDraft, coord: Coord): EditorDraft {
  const key = coordKey(coord)
  return {
    ...draft,
    startPositions: draft.startPositions.filter((s) => coordKey(s) !== key),
    encounters: draft.encounters.filter((e) => coordKey(e.position) !== key),
    resourceMarkers: draft.resourceMarkers.filter((r) => coordKey(r.position) !== key),
  }
}

/** Convert an `EditorDraft` to the shape @aop/engine understands.
 * `validateMapDefinition`/`createGame` both take this. Resource markers carry
 * straight through as `resourceNodes` (#101) — they're no longer editor-only
 * annotations, they drive real per-round income once a captain holds the tile. */
export function draftToMapDefinition(draft: EditorDraft): MapDefinition {
  return {
    width: draft.width,
    height: draft.height,
    tiles: draft.tiles.map((t) => ({ ...t })),
    startPositions: draft.startPositions.map((c) => ({ ...c })),
    encounters: draft.encounters.map((e) => ({ kind: e.kind, position: { ...e.position } })),
    resourceNodes: draft.resourceMarkers.map((r) => ({
      kind: r.kind,
      position: { ...r.position },
    })),
  }
}

/** The `MapSize` whose fixed dimensions are closest to the draft's — `GameConfig.mapSize`
 * is required even when `mapDefinition` is set (it's simply unused in that path), so this
 * just picks the most honest label rather than a meaningless default. */
export function nearestMapSize(width: number): MapSize {
  const sizes = Object.entries(MAP_DIMENSIONS) as [MapSize, number][]
  return sizes.reduce(
    (best, [size, dim]) =>
      Math.abs(dim - width) < Math.abs(MAP_DIMENSIONS[best] - width) ? size : best,
    sizes[0]![0],
  )
}
