import type { Coord } from '@aop/shared'
import { pairsContain } from './alliances'
import { mapDistance, type GameMap } from './map'
import type { GameState } from './types'

export function tileKey(coord: Coord): string {
  return `${coord.x},${coord.y}`
}

function keyToCoord(key: string): Coord {
  const [x, y] = key.split(',')
  return { x: Number(x), y: Number(y) }
}

/**
 * All tiles within `radius` of `center` under the map's grid distance
 * (Chebyshev on square maps — the whole scan box; true hex distance on hex
 * maps — the hex ball inside it), clipped to the map bounds. A single hex
 * step changes col and row by at most 1, so the ±radius box always contains
 * the full hex ball.
 */
export function tilesInRadius(center: Coord, radius: number, map: GameMap): Coord[] {
  const tiles: Coord[] = []
  for (let dy = -radius; dy <= radius; dy++) {
    for (let dx = -radius; dx <= radius; dx++) {
      const x = center.x + dx
      const y = center.y + dy
      if (x < 0 || x >= map.width || y < 0 || y >= map.height) continue
      if (mapDistance(map, center, { x, y }) > radius) continue
      tiles.push({ x, y })
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
    // A ship-lost captain (#499) contributes no vision of its own: leading a
    // party it stands on the party's tile (whose identical radius already
    // covers the same ground), and once rescued to the recruitment pool its
    // board position is a stale footnote, not a lookout.
    if (captain.ownerId === playerId && !captain.shipLost) {
      add(captain.position, captainVisionRadius)
    }
  }
  // A landing party (#465) sees as far as a captain — a scouting detachment,
  // not a fortress. Its own knob would be pure ceremony until play demands one.
  for (const party of state.parties) {
    if (party.ownerId === playerId) add(party.position, captainVisionRadius)
  }
  return tiles
}

/**
 * Tiles currently visible to `viewerId` unioned with those visible to every seat
 * it is allied with right now (#137, shared vision). Allied vision is a *live*
 * union — recomputed from the current alliance graph on every call — so breaking
 * an alliance revokes the shared sightlines on the very next view. Deliberately
 * NOT folded into the persistent `exploredTiles` (only own vision is, via
 * {@link accumulateExploredTiles}), so a tile seen solely through an ally is not
 * "remembered" once the alliance ends. Eliminated allies contribute nothing.
 */
export function visibleTilesWithAllies(state: GameState, viewerId: string): Coord[] {
  const seen = new Set<string>()
  const tiles: Coord[] = []
  const addFor = (id: string) => {
    for (const tile of currentlyVisibleTiles(state, id)) {
      const key = tileKey(tile)
      if (!seen.has(key)) {
        seen.add(key)
        tiles.push(tile)
      }
    }
  }
  addFor(viewerId)
  for (const p of state.players) {
    if (p.id !== viewerId && !p.eliminated && pairsContain(state.alliances.pairs, viewerId, p.id)) {
      addFor(p.id)
    }
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

/**
 * A hostile entity `playerId` can currently perceive (#372) — the fog-of-war
 * "contacts" a standing sail order watches for. An entity counts when its owner
 * is neither `playerId` nor a live ally:
 *
 * - enemy captains (not captured) standing on a currently-visible tile,
 * - active encounters on a currently-visible tile (they have no owner — always
 *   a contact when seen),
 * - enemy cities on an *explored* tile (a city, once found, stays a known
 *   contact even after it slips back under the fog — you don't forget a port).
 *
 * Returned as a sorted id list so a *new* contact is a cheap set-difference and
 * the value is byte-identical across machines (replay determinism). Pure — reads
 * only GameState.
 */
export function currentContacts(state: GameState, playerId: string): string[] {
  const isEnemy = (ownerId: string): boolean =>
    ownerId !== playerId && !pairsContain(state.alliances.pairs, playerId, ownerId)

  const visibleKeys = new Set(currentlyVisibleTiles(state, playerId).map(tileKey))
  const exploredKeys = new Set(state.exploredTiles[playerId] ?? [])
  const ids: string[] = []

  for (const captain of state.captains) {
    // A shipless captain (#498) is not a board piece of its own — its party,
    // one loop down, is the contact standing on that tile.
    if (
      !captain.captured &&
      !captain.shipLost &&
      isEnemy(captain.ownerId) &&
      visibleKeys.has(tileKey(captain.position))
    ) {
      ids.push(captain.id)
    }
  }
  // Enemy landing parties (#465) are contacts exactly like enemy captains: a
  // hostile force sighted ashore is worth pausing a standing sail order for.
  for (const party of state.parties) {
    if (isEnemy(party.ownerId) && visibleKeys.has(tileKey(party.position))) ids.push(party.id)
  }
  for (const encounter of state.encounters) {
    if (encounter.active && visibleKeys.has(tileKey(encounter.position))) ids.push(encounter.id)
  }
  for (const city of state.cities) {
    if (isEnemy(city.ownerId) && exploredKeys.has(tileKey(city.position))) ids.push(city.id)
  }

  return ids.sort()
}

/** The explored-tile key set for `playerId` after folding in whatever is visible right now. */
export function accumulateExploredTiles(state: GameState, playerId: string): string[] {
  const explored = new Set(state.exploredTiles[playerId] ?? [])
  for (const tile of currentlyVisibleTiles(state, playerId)) explored.add(tileKey(tile))
  return Array.from(explored)
}
