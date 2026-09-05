import { findPath, type Captain, type GameMap } from '@aop/engine'
import type { Coord } from '@aop/shared'

export const SOURCE_HEAD = 'c1824f22bf14dca6d38f7519fd99affd789a8130'
export const SOURCE_TREE = '68b5529d91f15cdbfeeb0f612da5ee0c7ebd547d'
export const FIXTURE_VERSION = 'aop-613-touch-recording-v1'

export const TILE_SIZE = 32
export const MAP_WIDTH = 12
export const MAP_HEIGHT = 12
export const VIEWER_ID = 'touch-recorder'

export const CAPTAIN_POSITION: Coord = { x: 2, y: 7 }
export const COURSE_TARGET: Coord = { x: 9, y: 7 }
Object.freeze(CAPTAIN_POSITION)
Object.freeze(COURSE_TARGET)

/**
 * An intentionally uneventful all-water board. The shipping pathfinder returns
 * a deterministic seven-step route from the selected captain, and the target
 * cannot be occupied by a city, encounter, or party because those fixture
 * collections are empty.
 */
export const MAP: GameMap = {
  width: MAP_WIDTH,
  height: MAP_HEIGHT,
  topology: 'square',
  startPositions: [CAPTAIN_POSITION],
  tiles: Array.from({ length: MAP_WIDTH * MAP_HEIGHT }, (_, index) => ({
    type: (Math.floor(index / MAP_WIDTH) + index) % 4 === 0 ? 'shallows' : 'deep',
    island: -1,
  })),
}
for (const tile of MAP.tiles) Object.freeze(tile)
Object.freeze(MAP.startPositions)
Object.freeze(MAP.tiles)
Object.freeze(MAP)

export const SELECTED_CAPTAIN: Captain = {
  id: 'captain-touch-recorder',
  ownerId: VIEWER_ID,
  name: 'Anne Bonny',
  position: CAPTAIN_POSITION,
  shipClassId: 'sloop',
  movementPoints: 1,
  maxMovementPoints: 4,
  troops: [{ unitId: 'swashbuckler', count: 6 }],
  xp: 0,
  skills: [],
  stats: { attack: 0, defense: 0, speed: 0 },
  items: [],
  shipUpgrades: {},
  captured: false,
}
for (const troop of SELECTED_CAPTAIN.troops) Object.freeze(troop)
Object.freeze(SELECTED_CAPTAIN.troops)
Object.freeze(SELECTED_CAPTAIN.skills)
Object.freeze(SELECTED_CAPTAIN.stats)
Object.freeze(SELECTED_CAPTAIN.items)
Object.freeze(SELECTED_CAPTAIN.shipUpgrades)
Object.freeze(SELECTED_CAPTAIN)

export const ALL_MAP_KEYS = new Set(
  Array.from({ length: MAP_WIDTH * MAP_HEIGHT }, (_, index) => {
    const x = index % MAP_WIDTH
    const y = Math.floor(index / MAP_WIDTH)
    return `${x},${y}`
  }),
)

const coursePath = findPath(MAP, CAPTAIN_POSITION, COURSE_TARGET)
if (!coursePath) throw new Error('touch fixture course target must have a shipping water path')
export const COURSE_STEP_COUNT = coursePath.length - 1

if (COURSE_STEP_COUNT <= SELECTED_CAPTAIN.movementPoints) {
  throw new Error('touch fixture course target must be out of range')
}
