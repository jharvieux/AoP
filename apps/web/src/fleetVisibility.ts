import { captainAwaitingCommand, type Captain, type LandingParty } from '@aop/engine'

/**
 * Own captains `MapCanvas.centerOnFleet` should consider (#523): a captured
 * captain has no board presence of its own, and a pooled rescue (#499,
 * `captainAwaitingCommand`) keeps its last board position — the beach it was
 * rescued from — as an inert footnote the engine ignores (no vision, no
 * targeting). Centering the camera there would show empty beach instead of a
 * real ship. Mirrors the `!c.captured && !captainAwaitingCommand(...)` filter
 * pattern already used in `cityModals.tsx` and swept across `ai.ts` (#499/#521
 * interplay fix) for the same reason.
 */
export function fleetCaptains<T extends Pick<Captain, 'id' | 'ownerId' | 'captured' | 'shipLost'>>(
  captains: readonly T[],
  parties: readonly Pick<LandingParty, 'captainId'>[],
  viewerId: string,
): T[] {
  return captains.filter(
    (c) => c.ownerId === viewerId && !c.captured && !captainAwaitingCommand(c, parties),
  )
}

/**
 * Should the minimap draw a position dot for `captain` (#523)? A pooled
 * rescue's position is the stale beach it was rescued from, same blind spot
 * as `fleetCaptains` above — applies to both own and enemy dots since a
 * stale position misleads either way. A ship-lost captain still leading a
 * party stays drawn: its position IS the party's, which is real and useful
 * (the party gets its own square marker at the same tile; the dot is a
 * harmless duplicate, not a stale one).
 */
export function shouldDrawCaptainDot(
  captain: Pick<Captain, 'id' | 'captured' | 'shipLost'>,
  parties: readonly Pick<LandingParty, 'captainId'>[],
): boolean {
  return !captainAwaitingCommand(captain, parties)
}
