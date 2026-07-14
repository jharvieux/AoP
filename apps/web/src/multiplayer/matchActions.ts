import {
  findLandPath,
  mapDistance,
  pathCost,
  tileAt,
  type Action,
  type BoardOrder,
  type Captain,
  type CaptainStat,
  type CityState,
  type EncounterChoice,
  type GameMap,
  type LandingParty,
  type PlayerView,
  type SailTargetKind,
  type StandingOrder,
  type TroopStack,
  type ViewCaptain,
  type ViewCity,
  type ViewParty,
} from '@aop/engine'
import type { Coord } from '@aop/shared'
import { findApproachPath } from '../approach'
import { partyBlockedSet } from '../partyMarch'

/**
 * Can `captainId` engage `targetPos` *this turn*, from any distance (#376,
 * mirrored for multiplayer at #414)? Already-adjacent is the zero-cost case
 * of the same approach-path query (`findApproachPath` returns the
 * single-tile `[from]` path when `from` is already a neighbor), so there's
 * one code path instead of a separate adjacency special-case. `+ 1` reserves
 * the movement point the attack itself spends. Returns the approach leg to
 * sail first (`null` if none needed, i.e. already adjacent) or `undefined`
 * if the target can't be reached and engaged this turn at all.
 */
export function approachToEngage(
  map: GameMap,
  from: Coord,
  targetPos: Coord,
  movementPoints: number,
): Coord[] | null | undefined {
  const approach = findApproachPath(map, from, targetPos)
  if (!approach) return undefined
  const cost = approach.length - 1
  if (cost + 1 > movementPoints) return undefined
  return cost > 0 ? approach : null
}

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
    stats: cap.stats ?? { attack: 0, defense: 0, speed: 0 },
    items: cap.items ?? [],
    shipUpgrades: cap.shipUpgrades ?? {},
    captured: cap.captured,
    ...(cap.capturedBy !== undefined ? { capturedBy: cap.capturedBy } : {}),
    ...(cap.captivityReturnRound !== undefined
      ? { captivityReturnRound: cap.captivityReturnRound }
      : {}),
    ...(cap.standingOrders ? { standingOrders: cap.standingOrders } : {}),
    ...(cap.boardOrders ? { boardOrders: cap.boardOrders } : {}),
    ...(cap.sailOrder ? { sailOrder: cap.sailOrder } : {}),
    ...(cap.shipLost ? { shipLost: cap.shipLost } : {}),
  }
}

/** The viewer's own landing-party detail rows (the only parties with manifests in a view). */
export function ownParties(view: PlayerView): ViewParty[] {
  return view.parties.filter((p) => p.ownerId === view.viewerId)
}

/**
 * Widen an own-seat `ViewParty` to the engine `LandingParty` shape UI
 * components expect, mirroring {@link captainFromView}. Returns null for an
 * enemy sighting (no own-detail fields) — those must never be dressed up as a
 * full party.
 */
export function partyFromView(party: ViewParty): LandingParty | null {
  if (party.troops === undefined || party.movementPoints === undefined) return null
  return {
    id: party.id,
    ownerId: party.ownerId,
    name: party.name,
    position: party.position,
    movementPoints: party.movementPoints,
    maxMovementPoints: party.maxMovementPoints ?? party.movementPoints,
    troops: party.troops,
    ...(party.marchOrder ? { marchOrder: party.marchOrder } : {}),
    ...(party.captainId !== undefined ? { captainId: party.captainId } : {}),
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
    ...(city.garrisonCaptainId !== undefined ? { garrisonCaptainId: city.garrisonCaptainId } : {}),
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
  /** An own landing party tapped (#482): select it — party verbs then flow through {@link interpretPartyTileClick}. */
  | { kind: 'selectParty'; partyId: string }
  | { kind: 'openCity'; cityId: string }
  | { kind: 'move'; to: { x: number; y: number } }
  | { kind: 'attack'; targetCaptainId: string }
  | { kind: 'encounter'; encounterId: string }
  /**
   * An adjacent empty land tile tapped with a troop-carrying selected captain
   * (#482): open the disembark sheet. The engine re-validates tile type,
   * adjacency, and the troop manifest server-side.
   */
  | { kind: 'disembark'; to: Coord }
  /**
   * A non-adjacent enemy that's still reachable-and-attackable this turn
   * (#414, finishing #376's multiplayer parity): sail the approach leg, then
   * attack, in one dispatch — `MatchScreen` mirrors `GameScreen`'s
   * `dispatchApproach` + `confirmAttack`. `approach` is the full inclusive
   * path from `findApproachPath`; its last tile is the `moveCaptain`
   * destination.
   */
  | { kind: 'approachAndAttack'; targetCaptainId: string; approach: Coord[] }
  /**
   * A multi-turn sail order (#372/#376): either a fixed distant tile
   * (`destination` only) or an intercept course toward a visible target
   * (`targetId`/`targetKind`). Dispatched as `setSailOrder`; the engine
   * re-validates reachability server-side.
   */
  | { kind: 'setSailOrder'; destination: Coord; targetId?: string; targetKind?: SailTargetKind }
  | null

export function interpretTileClick(
  view: PlayerView,
  /** The board map reconstructed by `boardFromPlayerView` (unexplored cells are inert fillers). */
  map: GameMap,
  selectedCaptainId: string | null,
  x: number,
  y: number,
): TileIntent {
  // A shipLost captain (#498) has no hull left — its position is a phantom
  // duplicate of its landing party's tile — so it's excluded here to let a
  // tap on that tile select the co-located party instead of a nonexistent ship.
  const ownHere = view.captains.find(
    (c) => c.ownerId === view.viewerId && !c.shipLost && c.position.x === x && c.position.y === y,
  )
  if (ownHere) return { kind: 'selectCaptain', captainId: ownHere.id }

  // An own landing party (#482) is selectable wherever it is tapped, exactly
  // like an own captain. (Taps WHILE a party is selected go through
  // interpretPartyTileClick instead — the screen dispatches on selection kind.)
  const ownPartyHere = view.parties.find(
    (p) => p.ownerId === view.viewerId && p.position.x === x && p.position.y === y,
  )
  if (ownPartyHere) return { kind: 'selectParty', partyId: ownPartyHere.id }

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
    if (mapDistance(map, selected.position, enemyHere.position) <= 1 && movement >= 1) {
      return { kind: 'attack', targetCaptainId: enemyHere.id }
    }
    if (mapDistance(map, selected.position, enemyHere.position) > 1) {
      // Beyond adjacency but reachable-and-attackable this turn (#414,
      // finishing #376 for multiplayer): approach and attack in one
      // dispatch, rather than only offering a multi-turn intercept course.
      // `approach` is never `null` here (that's only the already-adjacent
      // case, already handled above) — either a real leg or `undefined`.
      const approach = approachToEngage(map, selected.position, enemyHere.position, movement)
      if (approach) return { kind: 'approachAndAttack', targetCaptainId: enemyHere.id, approach }
      // Not reachable this turn: set an intercept course if there's any water
      // approach at all — the ship closes over the next turns and halts adjacent.
      if (findApproachPath(map, selected.position, enemyHere.position)) {
        return {
          kind: 'setSailOrder',
          destination: enemyHere.position,
          targetId: enemyHere.id,
          targetKind: 'captain',
        }
      }
    }
    return null
  }

  const encounterHere = view.encounters.find(
    (e) => e.active && e.position.x === x && e.position.y === y,
  )
  if (encounterHere) {
    if (mapDistance(map, selected.position, encounterHere.position) <= 1 && movement >= 1) {
      return { kind: 'encounter', encounterId: encounterHere.id }
    }
    if (
      mapDistance(map, selected.position, encounterHere.position) > 1 &&
      findApproachPath(map, selected.position, encounterHere.position)
    ) {
      return {
        kind: 'setSailOrder',
        destination: encounterHere.position,
        targetId: encounterHere.id,
        targetKind: 'encounter',
      }
    }
    return null
  }

  // Adjacent empty land with troops aboard (#482): put a landing party ashore.
  if (
    tileAt(map, { x, y })?.type === 'land' &&
    mapDistance(map, selected.position, { x, y }) === 1 &&
    movement >= 1 &&
    (selected.troops ?? []).some((t) => t.count > 0) &&
    !view.parties.some((p) => p.position.x === x && p.position.y === y)
  ) {
    return { kind: 'disembark', to: { x, y } }
  }

  // Empty tile: move if reachable within remaining movement. Unexplored cells
  // in the reconstructed map are 'deep' fillers, so a path may optimistically
  // cross fog — the server is the authority and bounces a truly illegal move.
  const cost = pathCost(map, selected.position, { x, y })
  if (cost === null) return null
  if (cost <= movement) return { kind: 'move', to: { x, y } }
  // Reachable by sea but beyond this turn: a multi-turn sail order (#372).
  return { kind: 'setSailOrder', destination: { x, y } }
}

/**
 * What a tap on tile (x, y) means while one of the viewer's OWN parties is
 * selected (#482) — the PlayerView analog of GameScreen's
 * `handlePartyTileClick` + own-tile tap classification, pure and testable
 * apart from dispatch. Fog is inherent to the view: enemy parties and land
 * encounters only exist in it while visible, so no extra visibility filtering
 * is needed here. Everything is a proposal the server re-validates.
 */
export type PartyTileIntent =
  | { kind: 'selectCaptain'; captainId: string }
  | { kind: 'selectParty'; partyId: string }
  /** An adjacent own ship tapped: re-board the party (partial if the hold is short). */
  | { kind: 'embark'; captainId: string }
  /** The party's own tile tapped while it stands on a capturable land site. */
  | { kind: 'captureSite'; siteId: string }
  /** An active land encounter underfoot or adjacent: open its choice sheet. */
  | { kind: 'partyEncounter'; encounterId: string }
  | { kind: 'attackParty'; targetPartyId: string }
  | { kind: 'assaultCity'; targetCityId: string }
  | { kind: 'moveParty'; to: Coord }
  /** Reachable overland but beyond this turn: a standing march order (#482). */
  | { kind: 'setMarchOrder'; destination: Coord }
  | null

export function interpretPartyTileClick(
  view: PlayerView,
  /** The board map reconstructed by `boardFromPlayerView`. */
  map: GameMap,
  /** The selected party — must be the viewer's own (movement disclosed). */
  party: ViewParty,
  x: number,
  y: number,
): PartyTileIntent {
  const movement = party.movementPoints ?? 0
  const here = (pos: Coord) => pos.x === x && pos.y === y
  const adjacent = (pos: Coord) => mapDistance(map, party.position, pos) <= 1

  // An own ship: adjacent re-boards the party; anywhere else selects it.
  // shipLost captains are excluded — no hull to embark onto (see interpretTileClick).
  const ownCaptainHere = view.captains.find(
    (c) => c.ownerId === view.viewerId && !c.shipLost && here(c.position),
  )
  if (ownCaptainHere) {
    return adjacent(ownCaptainHere.position)
      ? { kind: 'embark', captainId: ownCaptainHere.id }
      : { kind: 'selectCaptain', captainId: ownCaptainHere.id }
  }

  const partyHere = view.parties.find((p) => here(p.position))
  if (partyHere) {
    if (partyHere.ownerId !== view.viewerId) {
      return adjacent(partyHere.position) && movement >= 1
        ? { kind: 'attackParty', targetPartyId: partyHere.id }
        : null
    }
    if (partyHere.id === party.id && movement >= 1) {
      // The selected party's own tile: capture the site it stands on, or open
      // the land encounter sharing its tile (site wins — the #476 precedence).
      const site = view.landSites.find(
        (s) => s.active && here(s.position) && s.claimedBy !== view.viewerId,
      )
      if (site) return { kind: 'captureSite', siteId: site.id }
      const enc = view.landEncounters.find((e) => e.active && here(e.position))
      if (enc) return { kind: 'partyEncounter', encounterId: enc.id }
    }
    return { kind: 'selectParty', partyId: partyHere.id }
  }

  const cityHere = view.cities.find((c) => here(c.position))
  if (cityHere && cityHere.ownerId !== view.viewerId) {
    return adjacent(cityHere.position) && movement >= 1
      ? { kind: 'assaultCity', targetCityId: cityHere.id }
      : null
  }

  const encounterHere = view.landEncounters.find((e) => e.active && here(e.position))
  if (encounterHere) {
    return adjacent(encounterHere.position) && movement >= 1
      ? { kind: 'partyEncounter', encounterId: encounterHere.id }
      : null
  }

  // Land tile: march there this turn, or queue a standing march order (#482)
  // for a route beyond this turn's movement — the party twin of the ship's
  // move/setSailOrder split above.
  const path = findLandPath(
    map,
    party.position,
    { x, y },
    partyBlockedSet(map, view.parties, party.id),
  )
  if (!path || path.length < 2) return null
  const cost = path.length - 1
  if (cost <= movement) return { kind: 'moveParty', to: { x, y } }
  return { kind: 'setMarchOrder', destination: { x, y } }
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
 * Re-check, against the *authoritative* post-move view, whether `captainId`
 * can still attack `targetCaptainId` (#414): the approach leg's round trip
 * takes real wall-clock time, during which fog or an opposing action may
 * have moved the target, sunk it, pulled it out of visibility, or — via an
 * ally's capture — flipped its ownership to the viewer, none of which the
 * pre-move client snapshot can know about. Mirrors the same
 * owner-and-adjacency-and-movement gate `interpretTileClick`'s `enemyHere`
 * lookup + `'attack'` branch use, but against the fresh view/map rather than
 * the stale one the click happened against.
 */
export function canAttackAfterApproach(
  freshView: PlayerView,
  freshMap: GameMap,
  captainId: string,
  targetCaptainId: string,
): boolean {
  const captain = freshView.captains.find(
    (c) => c.id === captainId && c.ownerId === freshView.viewerId,
  )
  const target = freshView.captains.find(
    (c) => c.id === targetCaptainId && c.ownerId !== freshView.viewerId,
  )
  if (!captain || !target || (captain.movementPoints ?? 0) < 1) return false
  return mapDistance(freshMap, captain.position, target.position) <= 1
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
  chooseCaptainStat(view: PlayerView, captainId: string, stat: CaptainStat): Action {
    return { type: 'chooseCaptainStat', playerId: view.viewerId, captainId, stat }
  },
  garrisonCaptain(view: PlayerView, captainId: string, cityId: string): Action {
    return { type: 'garrisonCaptain', playerId: view.viewerId, captainId, cityId }
  },
  ungarrisonCaptain(view: PlayerView, cityId: string): Action {
    return { type: 'ungarrisonCaptain', playerId: view.viewerId, cityId }
  },
  takeItem(view: PlayerView, captainId: string, cityId: string, itemId: string): Action {
    return { type: 'takeItem', playerId: view.viewerId, captainId, cityId, itemId }
  },
  depositItem(view: PlayerView, captainId: string, cityId: string, itemId: string): Action {
    return { type: 'depositItem', playerId: view.viewerId, captainId, cityId, itemId }
  },
  upgradeShip(view: PlayerView, cityId: string, captainId: string, track: string): Action {
    return { type: 'upgradeShip', playerId: view.viewerId, cityId, captainId, track }
  },
  /** Omit `captainId` to mint a brand-new captain; pass an eligible captive's id to rehire it instead. */
  recruitCaptain(view: PlayerView, cityId: string, captainId?: string): Action {
    return {
      type: 'recruitCaptain',
      playerId: view.viewerId,
      cityId,
      ...(captainId ? { captainId } : {}),
    }
  },
  ransomCaptain(view: PlayerView, captainId: string): Action {
    return { type: 'ransomCaptain', playerId: view.viewerId, captainId }
  },
  disembark(
    view: PlayerView,
    captainId: string,
    to: Coord,
    troops: TroopStack[],
    withCaptain?: boolean,
  ): Action {
    return {
      type: 'disembark',
      playerId: view.viewerId,
      captainId,
      to,
      troops,
      ...(withCaptain ? { withCaptain: true } : {}),
    }
  },
  moveParty(view: PlayerView, partyId: string, to: Coord): Action {
    return { type: 'moveParty', playerId: view.viewerId, partyId, to }
  },
  embark(view: PlayerView, partyId: string, captainId: string): Action {
    return { type: 'embark', playerId: view.viewerId, partyId, captainId }
  },
  attackParty(view: PlayerView, partyId: string, targetPartyId: string): Action {
    return { type: 'attackParty', playerId: view.viewerId, partyId, targetPartyId }
  },
  partyAssaultCity(view: PlayerView, partyId: string, targetCityId: string): Action {
    return { type: 'partyAssaultCity', playerId: view.viewerId, partyId, targetCityId }
  },
  captureSite(view: PlayerView, partyId: string, siteId: string): Action {
    return { type: 'captureSite', playerId: view.viewerId, partyId, siteId }
  },
  resolvePartyEncounter(
    view: PlayerView,
    partyId: string,
    encounterId: string,
    choice: EncounterChoice,
  ): Action {
    return { type: 'resolvePartyEncounter', playerId: view.viewerId, partyId, encounterId, choice }
  },
  setMarchOrder(view: PlayerView, partyId: string, destination: Coord): Action {
    return { type: 'setMarchOrder', playerId: view.viewerId, partyId, destination }
  },
  clearMarchOrder(view: PlayerView, partyId: string): Action {
    return { type: 'clearMarchOrder', playerId: view.viewerId, partyId }
  },
  setSailOrder(
    view: PlayerView,
    captainId: string,
    destination: Coord,
    target?: { id: string; kind: SailTargetKind },
  ): Action {
    return {
      type: 'setSailOrder',
      playerId: view.viewerId,
      captainId,
      destination,
      ...(target ? { targetId: target.id, targetKind: target.kind } : {}),
    }
  },
  clearSailOrder(view: PlayerView, captainId: string): Action {
    return { type: 'clearSailOrder', playerId: view.viewerId, captainId }
  },
}
