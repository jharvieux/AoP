import type { Captain, LandingParty } from '@aop/engine'

/**
 * Whether a captain's ship is out of their hands right now (#498) — either
 * way immobile, orderless, and unable to trade items or garrison:
 *
 * - `'anchored'`: the captain is ashore leading a landing party
 *   (`LandingParty.captainId`); their ship still floats where it was left,
 *   but the engine's `requireShipControl` (reducer.ts) rejects every ship
 *   action for it until the captain re-embarks.
 * - `'shipLost'`: that anchored ship was since defeated and taken as a
 *   prize (`Captain.shipLost`); the captain stands ashore with the party,
 *   with no ship left to command at all.
 * - `null`: a normal captain in command of their own hull.
 *
 * Pure and testable apart from the three places that need the same
 * classification: `MapCanvas` (dim/skip the ship sprite), the game/match
 * screens (block client-side ship orders and show a "captain ashore" note —
 * the engine already rejects the action either way, this only saves a round
 * trip / a confusing tap), and the tavern modal (disable garrison/item
 * ship-actions for a docked-but-ashore captain).
 */
export type CaptainAshoreState = 'anchored' | 'shipLost' | null

export function captainAshoreState(
  captain: Pick<Captain, 'id' | 'shipLost'>,
  parties: readonly Pick<LandingParty, 'captainId'>[],
): CaptainAshoreState {
  if (captain.shipLost) return 'shipLost'
  return parties.some((p) => p.captainId === captain.id) ? 'anchored' : null
}
