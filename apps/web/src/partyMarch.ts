import { findLandPath, type GameMap } from '@aop/engine'
import type { Coord } from '@aop/shared'

/**
 * Multi-turn march, client-side (#476): parties have no engine-side standing
 * order yet (that's real engine work, tracked in #476's follow-up note), so a
 * tap on a tile beyond this turn's movement used to simply do nothing. Instead,
 * this plans the party as far along the full overland route as this turn's
 * movement allows — a per-turn re-tap on the same distant tile (the party stays
 * selected until `endTurn`, same as a captain) walks it the rest of the way,
 * one turn at a time, with zero new persisted state.
 */
export interface PartyMarchPlan {
  /** The tile to actually march to this turn — `to` itself if it's in range. */
  to: Coord
  /** Tiles still left to cover after this turn's move; 0 once `to` is `to`. */
  remainingSteps: number
}

/**
 * `null` when `to` isn't reachable overland at all (blocked, off-map, or not
 * land), when `from` already is `to`, or when the party has no movement left
 * to take even a first step.
 */
export function planPartyMarch(
  map: GameMap,
  from: Coord,
  to: Coord,
  movementPoints: number,
  blocked?: ReadonlySet<number>,
): PartyMarchPlan | null {
  if (movementPoints < 1) return null
  const path = findLandPath(map, from, to, blocked)
  if (!path || path.length < 2) return null
  const totalSteps = path.length - 1
  if (totalSteps <= movementPoints) return { to, remainingSteps: 0 }
  return { to: path[movementPoints]!, remainingSteps: totalSteps - movementPoints }
}
