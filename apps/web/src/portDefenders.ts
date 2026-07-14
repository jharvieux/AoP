import {
  mapDistance,
  type Captain,
  type CityState,
  type GameMap,
  type LandingParty,
} from '@aop/engine'

/**
 * How many of the viewer's own captains are currently contributing "ships in
 * port" defense to `city` (#498) — a client-side display mirror of the
 * engine's `cityPortDefenders` (reducer.ts): docked or garrisoned, within a
 * tile, not captured, not shipless, and not ashore leading a landing party.
 *
 * A pure function of already-available client state rather than a full
 * `GameState`, so it works identically for single-player (`game.captains`)
 * and multiplayer (`myCaptains` from a `PlayerView` — the only captains a
 * client ever sees in full detail, which is exactly the set that matters
 * here since a city only ever shows this to its own owner).
 */
export function portDefenderCount(
  captains: readonly Pick<Captain, 'id' | 'ownerId' | 'position' | 'captured' | 'shipLost'>[],
  parties: readonly Pick<LandingParty, 'captainId'>[],
  map: GameMap,
  city: Pick<CityState, 'ownerId' | 'position'>,
): number {
  return captains.filter(
    (c) =>
      c.ownerId === city.ownerId &&
      !c.captured &&
      !c.shipLost &&
      !parties.some((p) => p.captainId === c.id) &&
      mapDistance(map, c.position, city.position) <= 1,
  ).length
}
