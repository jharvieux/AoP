import { mapDistance, type GameMap } from '@aop/engine'
import type { Coord } from '@aop/shared'

/**
 * Return the viewer's captain docked at a city using the map's actual
 * topology. On hex maps the two square-only diagonals are distance 2 and must
 * not expose city actions that the authoritative reducer will reject.
 */
export function findViewerCaptainAtCity<
  CaptainAtPosition extends { ownerId: string; position: Coord },
>(
  captains: readonly CaptainAtPosition[],
  map: GameMap,
  viewerId: string,
  cityPosition: Coord,
): CaptainAtPosition | undefined {
  return captains.find(
    (captain) =>
      captain.ownerId === viewerId && mapDistance(map, captain.position, cityPosition) <= 1,
  )
}
