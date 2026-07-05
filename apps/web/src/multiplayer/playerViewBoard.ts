import {
  tileIndex,
  type Captain,
  type CityState,
  type EncounterState,
  type GameMap,
  type PlayerView,
} from '@aop/engine'
import type { FactionId } from '@aop/shared'

/**
 * The subset of `MapCanvas`'s props derivable from a fog-locked `PlayerView`
 * (i.e. everything except `viewerId`/`selectedCaptainId`/`onTileClick`, which
 * the read-only spectate/live screens supply themselves).
 */
export interface BoardFromView {
  map: GameMap
  captains: Captain[]
  cities: CityState[]
  encounters: EncounterState[]
  visibleKeys: Set<string>
  exploredKeys: Set<string>
  factionOf: (ownerId: string) => FactionId
}

/** A filler tile for map cells the viewer has never explored. Never read by
 * `MapCanvas` (it checks `exploredKeys` first), and shared by reference across
 * every unexplored cell since it is never mutated. */
const UNEXPLORED_TILE = { type: 'deep', island: -1 } as const

/**
 * Adapts a `PlayerView` — the only state shape a real seat-holder or a
 * granted spectator (#148/#149) ever receives over the wire — into the
 * full-shaped props `MapCanvas` expects, so live and spectate screens render
 * through the exact same board component single-player and replay already
 * use, rather than a second renderer that could quietly drift from it.
 *
 * `MapCanvas` only ever reads a handful of fields per entity (position,
 * ownerId, shipClassId, …); the rest of each engine type's required fields
 * (troops, garrison, standing orders, …) are hidden information a `PlayerView`
 * legitimately omits for anything but the viewer's own seat, and are filled
 * in here with inert defaults purely to satisfy the shared type — never
 * rendered, never fed back into the engine.
 */
export function boardFromPlayerView(view: PlayerView): BoardFromView {
  const map: GameMap = {
    width: view.mapWidth,
    height: view.mapHeight,
    tiles: new Array(view.mapWidth * view.mapHeight).fill(UNEXPLORED_TILE),
    startPositions: [],
  }

  const visibleKeys = new Set<string>()
  const exploredKeys = new Set<string>()
  for (const t of view.tiles) {
    const key = `${t.coord.x},${t.coord.y}`
    exploredKeys.add(key)
    if (t.visible) visibleKeys.add(key)
    map.tiles[tileIndex(map, t.coord.x, t.coord.y)] = { type: t.type, island: t.island }
  }

  const captains: Captain[] = view.captains.map((c) => ({
    id: c.id,
    ownerId: c.ownerId,
    name: c.name,
    position: c.position,
    shipClassId: c.shipClassId,
    movementPoints: c.movementPoints ?? 0,
    maxMovementPoints: c.maxMovementPoints ?? 0,
    troops: c.troops ?? [],
    xp: c.xp ?? 0,
    skills: c.skills ?? [],
    shipUpgrades: c.shipUpgrades ?? {},
  }))

  const cities: CityState[] = view.cities.map((c) => ({
    id: c.id,
    ownerId: c.ownerId,
    name: c.name,
    position: c.position,
    buildings: c.buildings ?? [],
    builtThisRound: c.builtThisRound ?? false,
    garrison: c.garrison ?? {},
    unitAvailability: c.unitAvailability ?? {},
  }))

  const encounters: EncounterState[] = view.encounters.map((e) => ({
    id: e.id,
    kind: e.kind as EncounterState['kind'],
    position: e.position,
    active: e.active,
    respawnRound: null,
  }))

  const factionById = new Map(view.players.map((p) => [p.id, p.faction]))
  const fallbackFaction = view.players[0]?.faction ?? 'pirates'
  const factionOf = (ownerId: string): FactionId => factionById.get(ownerId) ?? fallbackFaction

  return { map, captains, cities, encounters, visibleKeys, exploredKeys, factionOf }
}
