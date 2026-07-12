import { tileIndex, type GameMap, type LandingParty } from '@aop/engine'

/**
 * The impassable-tile set for a marching party (#465/#482): every other
 * party's tile, own or enemy — the exact block set the engine's `moveParty` /
 * `setMarchOrder` validate against. One shared helper so GameScreen's tap
 * handling, MapCanvas's route preview, and the multiplayer screen all derive
 * routes from the same `findLandPath` inputs instead of re-deriving the set
 * (and quietly drifting) at each call site.
 *
 * #476's client-side partial-march planner used to live here; engine-side
 * standing march orders (#482, `setMarchOrder`) made it obsolete — a tap
 * beyond this turn's movement now queues the whole route in GameState.
 */
export function partyBlockedSet(
  map: GameMap,
  parties: readonly Pick<LandingParty, 'id' | 'position'>[],
  selfId: string,
): Set<number> {
  return new Set(
    parties.filter((p) => p.id !== selfId).map((p) => tileIndex(map, p.position.x, p.position.y)),
  )
}
