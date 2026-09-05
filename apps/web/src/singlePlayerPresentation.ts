import { playerView, tileKey, type GameState } from '@aop/engine'
import type { Coord } from '@aop/shared'
import { boardFromPlayerView } from './multiplayer/playerViewBoard'

export type SinglePlayerPresentationBoard = ReturnType<typeof boardFromPlayerView>

/**
 * Builds the fog-safe board consumed by single-player presentation and input.
 *
 * The local game still keeps the complete {@link GameState} as action truth,
 * but rendering and interaction receive the same projection used at the
 * multiplayer authority boundary. Single-player additionally preserves its
 * established scouting behavior: a currently visible enemy city may expose
 * its live interior, while a remembered city keeps only the inert shell from
 * `playerView()`.
 */
export function singlePlayerPresentationBoard(
  game: GameState,
  viewerId: string,
): SinglePlayerPresentationBoard {
  const board = boardFromPlayerView(playerView(game, viewerId))
  const captainById = new Map(game.captains.map((captain) => [captain.id, captain]))
  const cityById = new Map(game.cities.map((city) => [city.id, city]))
  const partyById = new Map(game.parties.map((party) => [party.id, party]))

  const requireEntity = <T>(entities: Map<string, T>, family: string, id: string): T => {
    const entity = entities.get(id)
    if (!entity) throw new Error(`singlePlayerPresentationBoard: no ${family} with id "${id}"`)
    return entity
  }

  return {
    ...board,
    captains: board.captains.map((captain) =>
      captain.ownerId === viewerId ? requireEntity(captainById, 'captain', captain.id) : captain,
    ),
    cities: board.cities.map((city) => {
      if (city.ownerId !== viewerId && !board.visibleKeys.has(tileKey(city.position))) return city
      return requireEntity(cityById, 'city', city.id)
    }),
    parties: board.parties.map((party) =>
      party.ownerId === viewerId ? requireEntity(partyById, 'party', party.id) : party,
    ),
  }
}

interface Positioned {
  position: Coord
}

interface ActivePositioned extends Positioned {
  active: boolean
}

/**
 * Whether a course-preview tap targets a presented map entity. Callers pass a
 * presentation board, never authoritative single-player arrays, so hidden
 * entities cannot turn an apparently empty tile into a side channel.
 */
export function presentationCellOccupied(
  cell: Coord,
  occupants: {
    captains: readonly Positioned[]
    cities: readonly Positioned[]
    parties: readonly Positioned[]
    encounters: readonly ActivePositioned[]
    landSites: readonly ActivePositioned[]
    landEncounters: readonly ActivePositioned[]
  },
): boolean {
  const at = ({ position }: Positioned) => position.x === cell.x && position.y === cell.y
  return (
    occupants.captains.some(at) ||
    occupants.cities.some(at) ||
    occupants.parties.some(at) ||
    occupants.encounters.some((encounter) => encounter.active && at(encounter)) ||
    occupants.landSites.some((site) => site.active && at(site)) ||
    occupants.landEncounters.some((encounter) => encounter.active && at(encounter))
  )
}
