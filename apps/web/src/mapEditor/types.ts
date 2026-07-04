import type { EncounterKind, Tile, TileType } from '@aop/engine'
import type { Coord } from '@aop/shared'

/**
 * Map editor domain types (#41). `EditorDraft` is a superset of the engine's
 * `MapDefinition`: everything the engine understands (tiles, start positions,
 * author-placed encounters) plus `resourceMarkers`, an editor-only annotation
 * layer. There is no map-tile "resource node" concept in @aop/engine today
 * (economy income comes from city buildings, not map entities) — markers are
 * informational placeholders that round-trip through save/export so sculpting
 * isn't lost, but `draftToMapDefinition` drops them before test-play/createGame.
 * Full resource-node economy integration is tracked as a follow-up issue.
 */

export type ResourceMarkerKind = 'gold' | 'timber' | 'iron' | 'rum'

export const RESOURCE_MARKER_KINDS: readonly ResourceMarkerKind[] = [
  'gold',
  'timber',
  'iron',
  'rum',
]

export const ENCOUNTER_KINDS: readonly EncounterKind[] = ['merchant', 'natives', 'settlers']

export const TILE_TYPES: readonly TileType[] = ['deep', 'shallows', 'land', 'port']

export interface ResourceMarker {
  kind: ResourceMarkerKind
  position: Coord
}

export interface EncounterDraftPlacement {
  kind: EncounterKind
  position: Coord
}

export interface EditorDraft {
  /** Stable identity for local storage — independent of `name` so renaming a
   * draft updates its existing save slot instead of forking a new one. */
  id: string
  name: string
  width: number
  height: number
  /** Row-major, length `width * height` — same layout as `GameMap.tiles`. */
  tiles: Tile[]
  startPositions: Coord[]
  encounters: EncounterDraftPlacement[]
  resourceMarkers: ResourceMarker[]
}

export type TileTool = 'brush' | 'fill' | 'eraser'

export type EntityPaletteItem =
  | { kind: 'start' }
  | { kind: 'encounter'; encounterKind: EncounterKind }
  | { kind: 'resource'; resourceKind: ResourceMarkerKind }

export type EditorMode = 'tile' | 'entity' | 'erase'
