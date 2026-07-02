import type { Coord } from '@aop/shared'
import type { GameMap } from './map'
import type { GameState } from './types'

export function tileKey(coord: Coord): string {
  return `${coord.x},${coord.y}`
}

function keyToCoord(key: string): Coord {
  const [x, y] = key.split(',')
  return { x: Number(x), y: Number(y) }
}

/** All tiles within `radius` (Chebyshev distance) of `center`, clipped to the map bounds. */
export function tilesInRadius(center: Coord, radius: number, map: GameMap): Coord[] {
  const tiles: Coord[] = []
  for (let dy = -radius; dy <= radius; dy++) {
    for (let dx = -radius; dx <= radius; dx++) {
      const x = center.x + dx
      const y = center.y + dy
      if (x >= 0 && x < map.width && y >= 0 && y < map.height) {
        tiles.push({ x, y })
      }
    }
  }
  return tiles
}

/**
 * Tiles currently visible to `playerId`: everything within vision range of their
 * cities and captains. Pure — reads only GameState, so it becomes the
 * server-side fog filter in Phase 3 (#4).
 */
export function currentlyVisibleTiles(state: GameState, playerId: string): Coord[] {
  const { cityVisionRadius, captainVisionRadius } = state.config.setup
  const seen = new Set<string>()
  const tiles: Coord[] = []
  const add = (center: Coord, radius: number) => {
    for (const tile of tilesInRadius(center, radius, state.map)) {
      const key = tileKey(tile)
      if (!seen.has(key)) {
        seen.add(key)
        tiles.push(tile)
      }
    }
  }
  for (const city of state.cities) {
    if (city.ownerId === playerId) add(city.position, cityVisionRadius)
  }
  for (const captain of state.captains) {
    if (captain.ownerId === playerId) add(captain.position, captainVisionRadius)
  }
  return tiles
}

/**
 * The fog-of-war selector: currently-visible tiles plus every tile this player
 * has ever explored (from state.exploredTiles). Pure function of GameState — it
 * must never read anything outside `state`.
 */
export function visibleState(
  state: GameState,
  playerId: string,
): { visible: Coord[]; explored: Coord[] } {
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
