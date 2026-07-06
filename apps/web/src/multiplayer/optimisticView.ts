import { pathCost, type Action, type GameMap, type PlayerView } from '@aop/engine'

/**
 * Optimistic local application of the viewer's own action (#285,
 * docs/MULTIPLAYER.md §9 step 2 — "apply optimistically ... render
 * immediately, send submit-action"). MatchScreen previously always waited
 * out the full round trip before updating anything, even for a plain move
 * whose outcome is fully knowable client-side. Every action this returns
 * `null` for keeps that wait — deliberately: an attack's outcome depends on
 * the server-withheld RNG (§7) and enemy manifest, and a city/economy action
 * depends on resource math this module has no reason to re-derive, so
 * "nothing to preview honestly" is the correct answer for those, not a
 * guess. Only `moveCaptain` — deterministic, computable purely from the
 * view's own map and the mover's remaining movement — gets an optimistic
 * patch. The caller (`MatchScreen`) discards this patch the moment a fresh
 * `PlayerView` arrives, whether that is the server's own confirmation or a
 * `reconnectSync`-triggered resync after a rejection — never held past one
 * server round trip.
 */
export function applyOptimisticAction(
  view: PlayerView,
  map: GameMap,
  action: Action,
): PlayerView | null {
  if (action.type !== 'moveCaptain') return null

  const index = view.captains.findIndex(
    (c) => c.id === action.captainId && c.ownerId === view.viewerId,
  )
  if (index === -1) return null
  const captain = view.captains[index]!
  if (captain.movementPoints === undefined) return null

  const cost = pathCost(map, captain.position, action.to)
  if (cost === null || cost > captain.movementPoints) return null

  const captains = [...view.captains]
  captains[index] = {
    ...captain,
    position: action.to,
    movementPoints: captain.movementPoints - cost,
  }
  return { ...view, captains }
}
