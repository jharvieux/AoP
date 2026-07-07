import {
  pathCost,
  type Action,
  type BoardOrder,
  type Captain,
  type CityState,
  type EncounterChoice,
  type GameMap,
  type PlayerView,
  type StandingOrder,
  type ViewCaptain,
  type ViewCity,
} from '@aop/engine'
import { chebyshevDistance } from '@aop/shared'

/**
 * The PlayerView-shaped action surface for the multiplayer match screen
 * (#261). GameScreen's handlers read a full `GameState`; a multiplayer client
 * only ever holds a fog-locked `PlayerView` (§7), so the same intents —
 * select / move / attack / encounter / open-city — are re-derived here from
 * the view alone, as pure functions the screen dispatches on and tests hit
 * directly. Everything is a *proposal*: `submit-action` re-validates through
 * the engine server-side, so the worst a wrong local judgment can produce is
 * a clean `INVALID_ACTION`/`NOT_YOUR_TURN` bounce, never divergent state.
 */

/** The viewer's own captain detail rows (the only captains with manifests in a view). */
export function ownCaptains(view: PlayerView): ViewCaptain[] {
  return view.captains.filter((c) => c.ownerId === view.viewerId)
}

/**
 * Widen an own-seat `ViewCaptain` to the engine `Captain` shape UI components
 * (`CityScreen`, `MapCanvas`) expect. Own rows carry the full manifest,
 * including the captain's own standing/board orders (#285 — disclosed for the
 * viewer's own captains only, see `playerView.ts`), so `CityScreen`'s presets
 * reflect what's actually saved server-side instead of always starting blank.
 * Returns null for an enemy hull (no own-detail fields): those must never be
 * dressed up as a full Captain.
 */
export function captainFromView(cap: ViewCaptain): Captain | null {
  if (cap.troops === undefined || cap.movementPoints === undefined) return null
  return {
    id: cap.id,
    ownerId: cap.ownerId,
    name: cap.name,
    position: cap.position,
    shipClassId: cap.shipClassId,
    movementPoints: cap.movementPoints,
    maxMovementPoints: cap.maxMovementPoints ?? cap.movementPoints,
    troops: cap.troops,
    xp: cap.xp ?? 0,
    skills: cap.skills ?? [],
    shipUpgrades: cap.shipUpgrades ?? {},
    captured: cap.captured,
    ...(cap.capturedBy !== undefined ? { capturedBy: cap.capturedBy } : {}),
    ...(cap.captivityReturnRound !== undefined
      ? { captivityReturnRound: cap.captivityReturnRound }
      : {}),
    ...(cap.standingOrders ? { standingOrders: cap.standingOrders } : {}),
    ...(cap.boardOrders ? { boardOrders: cap.boardOrders } : {}),
  }
}

/** Widen an own-seat `ViewCity` (interior disclosed) to `CityState`; null for an enemy shell. */
export function cityFromView(city: ViewCity): CityState | null {
  if (!city.buildings || !city.garrison || !city.unitAvailability) return null
  return {
    id: city.id,
    ownerId: city.ownerId,
    name: city.name,
    position: city.position,
    buildings: city.buildings,
    builtThisRound: city.builtThisRound ?? false,
    garrison: city.garrison,
    unitAvailability: city.unitAvailability,
  }
}

/**
 * What a tap on tile (x, y) means, given the current selection — the
 * PlayerView analog of GameScreen's `handleTileClick`, split so the decision
 * is testable apart from dispatch. `'attack'` and `'encounter'` open confirm
 * sheets rather than dispatching directly (attacks in multiplayer get no odds
 * preview: an enemy manifest is exactly what fog hides, so there is nothing
 * honest to estimate odds from).
 */
export type TileIntent =
  | { kind: 'selectCaptain'; captainId: string }
  | { kind: 'openCity'; cityId: string }
  | { kind: 'move'; to: { x: number; y: number } }
  | { kind: 'attack'; targetCaptainId: string }
  | { kind: 'encounter'; encounterId: string }
  | null

export function interpretTileClick(
  view: PlayerView,
  /** The board map reconstructed by `boardFromPlayerView` (unexplored cells are inert fillers). */
  map: GameMap,
  selectedCaptainId: string | null,
  x: number,
  y: number,
): TileIntent {
  const ownHere = view.captains.find(
    (c) => c.ownerId === view.viewerId && c.position.x === x && c.position.y === y,
  )
  if (ownHere) return { kind: 'selectCaptain', captainId: ownHere.id }

  const selected = selectedCaptainId
    ? (view.captains.find((c) => c.id === selectedCaptainId && c.ownerId === view.viewerId) ?? null)
    : null

  if (!selected) {
    // No selection: a tap on one of the viewer's own cities opens it (the
    // multiplayer analog of GameScreen's City button, which assumes a single
    // city — a seat here can own several once captures land).
    const ownCityHere = view.cities.find(
      (c) => c.ownerId === view.viewerId && c.position.x === x && c.position.y === y,
    )
    return ownCityHere ? { kind: 'openCity', cityId: ownCityHere.id } : null
  }

  const movement = selected.movementPoints ?? 0

  const enemyHere = view.captains.find(
    (c) => c.ownerId !== view.viewerId && c.position.x === x && c.position.y === y,
  )
  if (enemyHere) {
    if (chebyshevDistance(selected.position, enemyHere.position) <= 1 && movement >= 1) {
      return { kind: 'attack', targetCaptainId: enemyHere.id }
    }
    return null
  }

  const encounterHere = view.encounters.find(
    (e) => e.active && e.position.x === x && e.position.y === y,
  )
  if (encounterHere) {
    if (chebyshevDistance(selected.position, encounterHere.position) <= 1 && movement >= 1) {
      return { kind: 'encounter', encounterId: encounterHere.id }
    }
    return null
  }

  // Empty tile: move if reachable within remaining movement. Unexplored cells
  // in the reconstructed map are 'deep' fillers, so a path may optimistically
  // cross fog — the server is the authority and bounces a truly illegal move.
  const cost = pathCost(map, selected.position, { x, y })
  if (cost !== null && cost <= movement) return { kind: 'move', to: { x, y } }
  return null
}

/**
 * Optimistic local patch for a move (#285 "optimistic local application"):
 * shifts the moving captain to its destination and spends the movement cost
 * right away, so the board updates before the `submit-action` round trip
 * returns rather than sitting frozen for a poll interval. Purely a rendering
 * prediction — `MatchScreen` always replaces the whole view wholesale once
 * the server answers (§13: no diff-patching) and discards this patch outright
 * on any rejection, so a wrong guess here can never desync real state, only
 * flicker back on the next authoritative view. Returns `view` unchanged if
 * the captain isn't the viewer's own, has no disclosed movement, or the
 * destination isn't reachable at the view's cached cost (should never happen
 * for a caller that only invokes this after `interpretTileClick` accepted the
 * same move, but never throws either way).
 */
export function applyOptimisticMove(
  view: PlayerView,
  map: GameMap,
  captainId: string,
  to: { x: number; y: number },
): PlayerView {
  const captain = view.captains.find((c) => c.id === captainId && c.ownerId === view.viewerId)
  if (!captain || captain.movementPoints === undefined) return view
  const cost = pathCost(map, captain.position, to)
  if (cost === null) return view
  const spent = Math.max(0, captain.movementPoints - cost)
  return {
    ...view,
    captains: view.captains.map((c) =>
      c.id === captainId ? { ...c, position: to, movementPoints: spent } : c,
    ),
  }
}

/**
 * Action builders — thin and typo-proof. `playerId` is the viewer's own seat
 * id; the server overwrites it from the JWT anyway (§11), so it can never
 * impersonate.
 */
export const matchAction = {
  move(view: PlayerView, captainId: string, to: { x: number; y: number }): Action {
    return { type: 'moveCaptain', playerId: view.viewerId, captainId, to }
  },
  attack(view: PlayerView, captainId: string, targetCaptainId: string): Action {
    return { type: 'attackCaptain', playerId: view.viewerId, captainId, targetCaptainId }
  },
  endTurn(view: PlayerView): Action {
    return { type: 'endTurn', playerId: view.viewerId }
  },
  resign(view: PlayerView): Action {
    return { type: 'resign', playerId: view.viewerId }
  },
  proposeAlliance(view: PlayerView, targetId: string): Action {
    return { type: 'proposeAlliance', playerId: view.viewerId, targetId }
  },
  acceptAlliance(view: PlayerView, proposerId: string): Action {
    return { type: 'acceptAlliance', playerId: view.viewerId, proposerId }
  },
  leaveAlliance(view: PlayerView, otherId: string): Action {
    return { type: 'leaveAlliance', playerId: view.viewerId, otherId }
  },
  resolveEncounter(
    view: PlayerView,
    captainId: string,
    encounterId: string,
    choice: EncounterChoice,
  ): Action {
    return { type: 'resolveEncounter', playerId: view.viewerId, captainId, encounterId, choice }
  },
  construct(view: PlayerView, cityId: string, buildingId: string): Action {
    return { type: 'construct', playerId: view.viewerId, cityId, buildingId }
  },
  recruit(view: PlayerView, cityId: string, unitId: string): Action {
    return { type: 'recruit', playerId: view.viewerId, cityId, unitId, count: 1 }
  },
  transferTroops(
    view: PlayerView,
    cityId: string,
    captainId: string,
    direction: 'toShip' | 'toGarrison',
    unitId: string,
  ): Action {
    return {
      type: 'transferTroops',
      playerId: view.viewerId,
      cityId,
      captainId,
      direction,
      unitId,
      count: 1,
    }
  },
  setStandingOrders(
    view: PlayerView,
    captainId: string,
    orders: StandingOrder[],
    boardOrders?: BoardOrder[],
  ): Action {
    return {
      type: 'setStandingOrders',
      playerId: view.viewerId,
      captainId,
      orders,
      ...(boardOrders ? { boardOrders } : {}),
    }
  },
  chooseCaptainSkill(view: PlayerView, captainId: string, skillId: string): Action {
    return { type: 'chooseCaptainSkill', playerId: view.viewerId, captainId, skillId }
  },
  upgradeShip(view: PlayerView, cityId: string, captainId: string, track: string): Action {
    return { type: 'upgradeShip', playerId: view.viewerId, cityId, captainId, track }
  },
}
