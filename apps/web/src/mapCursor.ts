import type { TileType } from '@aop/engine'
import type { Coord } from '@aop/shared'

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

/** Adjusts a pan offset by the minimum amount needed so `tile` is fully within the
 * viewport — "scrollIntoView" for the map's own pan/zoom camera, since keyboard users
 * have no pointer/pinch gesture to bring an off-screen cursor tile into view. A no-op
 * (returns the same x/y) if the tile is already fully visible. */
export function panToKeepTileVisible(
  view: { x: number; y: number; scale: number },
  tile: Coord,
  tileSize: number,
  viewportWidth: number,
  viewportHeight: number,
): { x: number; y: number } {
  const left = tile.x * tileSize * view.scale + view.x
  const top = tile.y * tileSize * view.scale + view.y
  const size = tileSize * view.scale
  let x = view.x
  let y = view.y
  if (left < 0) x -= left
  else if (left + size > viewportWidth) x -= left + size - viewportWidth
  if (top < 0) y -= top
  else if (top + size > viewportHeight) y -= top + size - viewportHeight
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

export interface DescribeTileParams {
  tile: Coord
  terrain: TileType
  captains: readonly PositionedOwned[]
  cities: readonly PositionedOwned[]
  encounters: readonly ActiveEncounterLike[]
  viewerId: string
  /** Display name for whichever faction owns a captain found on the tile, if any. */
  factionNameOf: (ownerId: string) => string
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
  const { tile, terrain, captains, cities, encounters, viewerId, factionNameOf } = params
  const at = (p: Coord) => p.x === tile.x && p.y === tile.y
  const parts = [`Tile column ${tile.x + 1}, row ${tile.y + 1}`]

  const captain = captains.find((c) => at(c.position))
  if (captain) {
    const owned = captain.ownerId === viewerId ? 'Your' : 'Enemy'
    parts.push(`${owned} ${factionNameOf(captain.ownerId)} ship`)
  }
  const city = cities.find((c) => at(c.position))
  if (city) parts.push(city.ownerId === viewerId ? 'your city' : 'enemy city')
  const encounter = encounters.find((e) => e.active && at(e.position))
  if (encounter) parts.push(`${encounter.kind} encounter`)
  if (!captain && !city && !encounter) parts.push(TERRAIN_LABEL[terrain])

  return parts.join(', ')
}
