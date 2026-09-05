import type { GridTopology, TileType } from '@aop/engine'
import type { Coord } from '@aop/shared'
import { cellPolygon } from './mapLayout'

/**
 * Pure helpers for MapCanvas's keyboard cursor (#247): arrow-key movement,
 * panning the camera to keep the cursor tile on screen, and the text
 * announced to an offscreen live region. Kept separate from MapCanvas (which
 * owns the Pixi scene and can't run in a DOM-less test) the same way
 * mapSprites.ts pulls the sprite-resolution logic out.
 */

const ARROW_DELTA: Partial<Record<string, Coord>> = {
  ArrowUp: { x: 0, y: -1 },
  ArrowDown: { x: 0, y: 1 },
  ArrowLeft: { x: -1, y: 0 },
  ArrowRight: { x: 1, y: 0 },
}

/** Next cursor tile for an arrow key, clamped to the map bounds. `null` for any other key,
 * so the caller can let unrelated keys (Tab, Escape, …) do their normal thing. */
export function moveCursor(
  cursor: Coord,
  key: string,
  mapWidth: number,
  mapHeight: number,
): Coord | null {
  const delta = ARROW_DELTA[key]
  if (!delta) return null
  return {
    x: Math.min(mapWidth - 1, Math.max(0, cursor.x + delta.x)),
    y: Math.min(mapHeight - 1, Math.max(0, cursor.y + delta.y)),
  }
}

/** Adjusts a pan offset by the minimum amount needed so `tile`'s rendered square/hex
 * polygon is fully within the viewport — "scrollIntoView" for the map's own pan/zoom
 * camera, since keyboard users have no pointer/pinch gesture to bring an off-screen
 * cursor tile into view. A no-op (returns the same x/y) if the tile is already fully
 * visible. */
export function panToKeepTileVisible(
  view: { x: number; y: number; scale: number },
  tile: Coord,
  tileSize: number,
  viewportWidth: number,
  viewportHeight: number,
  topology: GridTopology = 'square',
): { x: number; y: number } {
  const polygon = cellPolygon(topology, tile.x, tile.y, tileSize)
  const worldXs = polygon.filter((_, index) => index % 2 === 0)
  const worldYs = polygon.filter((_, index) => index % 2 === 1)
  const left = Math.min(...worldXs) * view.scale + view.x
  const right = Math.max(...worldXs) * view.scale + view.x
  const top = Math.min(...worldYs) * view.scale + view.y
  const bottom = Math.max(...worldYs) * view.scale + view.y
  let x = view.x
  let y = view.y
  if (left < 0) x -= left
  else if (right > viewportWidth) x -= right - viewportWidth
  if (top < 0) y -= top
  else if (bottom > viewportHeight) y -= bottom - viewportHeight
  return { x, y }
}

/** Structurally compatible with Captain/CityState (@aop/engine) — just enough
 * shape for describeMapTile to identify what's on a tile without importing
 * those full interfaces (and so tests can use plain literals). */
interface PositionedOwned {
  position: Coord
  ownerId: string
}

interface ActiveEncounterLike {
  position: Coord
  kind: string
  active: boolean
}

interface DescribeTileParams {
  tile: Coord
  terrain: TileType
  captains: readonly PositionedOwned[]
  cities: readonly PositionedOwned[]
  encounters: readonly ActiveEncounterLike[]
  /** Landing parties ashore (#465). Optional so pre-party callers/tests stand unchanged. */
  parties?: readonly PositionedOwned[]
  viewerId: string
  /** Display name for whichever faction owns a captain found on the tile, if any. */
  factionNameOf: (ownerId: string) => string
  /** Whether the tile has ever been explored. Defaults to true for existing callers. */
  explored?: boolean
  /** Whether the tile is currently visible. Defaults to true for existing callers. */
  visible?: boolean
}

const TERRAIN_LABEL: Record<TileType, string> = {
  deep: 'open water',
  shallows: 'shallows',
  land: 'island',
  port: 'port',
}

/** The text announced to the offscreen live region when the keyboard cursor moves onto
 * (or selects) a tile — 1-based coordinates since that's what a screen-reader user expects
 * ("row 1, column 1", not "row 0"). */
export function describeMapTile(params: DescribeTileParams): string {
  const {
    tile,
    terrain,
    captains,
    cities,
    encounters,
    parties = [],
    viewerId,
    factionNameOf,
    explored = true,
    visible = true,
  } = params
  const at = (p: Coord) => p.x === tile.x && p.y === tile.y
  const parts = [`Tile column ${tile.x + 1}, row ${tile.y + 1}`]

  if (!explored) return [...parts, 'unexplored'].join(', ')

  const captain = visible ? captains.find((c) => at(c.position)) : undefined
  if (captain) {
    const owned = captain.ownerId === viewerId ? 'Your' : 'Enemy'
    parts.push(`${owned} ${factionNameOf(captain.ownerId)} ship`)
  }
  const city = cities.find((c) => at(c.position))
  if (city) parts.push(city.ownerId === viewerId ? 'your city' : 'enemy city')
  const party = visible ? parties.find((p) => at(p.position)) : undefined
  if (party) parts.push(party.ownerId === viewerId ? 'your landing party' : 'enemy landing party')
  const encounter = visible ? encounters.find((e) => e.active && at(e.position)) : undefined
  if (encounter) parts.push(`${encounter.kind} encounter`)
  if (!captain && !city && !party && !encounter) parts.push(TERRAIN_LABEL[terrain])

  return parts.join(', ')
}
