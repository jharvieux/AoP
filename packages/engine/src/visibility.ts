import { MAP_DIMENSIONS, type TileCoord } from '@aop/shared'
import type { GameState } from './types'

/** Tiles within this many steps (Chebyshev distance) of an owned city are visible. */
const CITY_VISION_RADIUS = 3

export function tileKey(coord: TileCoord): string {
  return `${coord.x},${coord.y}`
}

function keyToCoord(key: string): TileCoord {
  const [x, y] = key.split(',')
  return { x: Number(x), y: Number(y) }
}

/** All tiles within `radius` (Chebyshev distance) of `center`, clipped to the map bounds. */
export function tilesInRadius(
  center: TileCoord,
  radius: number,
  mapSize: GameState['config']['mapSize'],
): TileCoord[] {
  const { width, height } = MAP_DIMENSIONS[mapSize]
  const tiles: TileCoord[] = []
  for (let dy = -radius; dy <= radius; dy++) {
    for (let dx = -radius; dx <= radius; dx++) {
      const x = center.x + dx
      const y = center.y + dy
      if (x >= 0 && x < width && y >= 0 && y < height) {
        tiles.push({ x, y })
      }
    }
  }
  return tiles
}

/**
 * Tiles currently visible to `playerId` from their owned cities. Pure — no
 * captain positions yet (captain map placement lands with #8), so vision
 * only radiates from cities for now.
 */
export function currentlyVisibleTiles(state: GameState, playerId: string): TileCoord[] {
  const seen = new Set<string>()
  const tiles: TileCoord[] = []
  for (const city of state.cities) {
    if (city.ownerId !== playerId) continue
    for (const tile of tilesInRadius(city.position, CITY_VISION_RADIUS, state.config.mapSize)) {
      const key = tileKey(tile)
      if (!seen.has(key)) {
        seen.add(key)
        tiles.push(tile)
      }
    }
  }
  return tiles
}

/**
 * The fog-of-war selector: currently-visible tiles plus every tile this
 * player has ever explored (from state.exploredTiles). Pure function of
 * GameState — this becomes the server-side fog filter in Phase 3 (#4), so
 * it must never read anything outside `state`.
 */
export function visibleState(
  state: GameState,
  playerId: string,
): { visible: TileCoord[]; explored: TileCoord[] } {
  const visible = currentlyVisibleTiles(state, playerId)
  const exploredKeys = new Set(state.exploredTiles[playerId] ?? [])
  for (const tile of visible) exploredKeys.add(tileKey(tile))
  return { visible, explored: Array.from(exploredKeys, keyToCoord) }
}

/** The explored-tile key set for `playerId` after folding in whatever is visible right now. */
export function accumulateExploredTiles(state: GameState, playerId: string): string[] {
  const explored = new Set(state.exploredTiles[playerId] ?? [])
  for (const tile of currentlyVisibleTiles(state, playerId)) explored.add(tileKey(tile))
  return Array.from(explored)
}
