import {
  addResources,
  canAfford,
  coordsEqual,
  subtractResources,
  turretUnitId,
  type Coord,
  type ResourcePool,
} from '@aop/shared'
import {
  InvalidActionError,
  type AcceptAllianceAction,
  type Action,
  type AttackCaptainAction,
  type AttackCityAction,
  type AttackPartyAction,
  type CaptureSiteAction,
  type ChooseCaptainSkillAction,
  type ChooseCaptainStatAction,
  type ClearMarchOrderAction,
  type ClearSailOrderAction,
  type ConstructBuildingAction,
  type DepositItemAction,
  type DisembarkAction,
  type EmbarkAction,
  type GainCaptainXpAction,
  type GarrisonCaptainAction,
  type LeaveAllianceAction,
  type MoveCaptainAction,
  type MovePartyAction,
  type PartyAssaultCityAction,
  type ProposeAllianceAction,
  type RansomCaptainAction,
  type RecruitCaptainAction,
  type RecruitUnitAction,
  type ResolveEncounterAction,
  type ResolvePartyEncounterAction,
  type SetMarchOrderAction,
  type SetSailOrderAction,
  type SetStandingOrdersAction,
  type TakeItemAction,
  type TransferTroopsAction,
  type UngarrisonCaptainAction,
  type UpgradeShipAction,
} from './actions'
import {
  canonicalPair,
  clearBrokenAlliance,
  pairEquals,
  pairsContain,
  proposalBetween,
  pruneAlliancesForSeats,
  recordBrokenAlliance,
  wasAllyWithinTruce,
} from './alliances'
import {
  BOARD_DOCTRINES,
  BOARD_ORDER_CONDITIONS,
  boardOrdersDriver,
  boardPlanDriver,
  resolveBoardCombat,
  type BoardCommand,
} from './battleBoard'
import {
  createCombatStats,
  effectiveShip,
  type BattleReport,
  type Combatant,
  type CombatResult,
  type TacticsTuning,
} from './combat'
import type { ContentCatalog, EncounterKind, LandEncounterKind } from './content'
import {
  cityUnlocksCaptains,
  playerIncome,
  replenishAvailability,
  unlockedRecruitTier,
} from './economy'
import { reactivateEncounters, resolveEncounterChoice } from './encounters'
import { areAllied, currentPlayer } from './game'
import { rollItemDrop } from './items'
import { isWaterTile, mapDistance, mapNeighbors, tileAt, tileIndex, type GameMap } from './map'
import { findLandPath, findPath, pathCost } from './pathfinding'
import { RULES_VERSION, RulesVersionMismatchError } from './rulesVersion'
import { effectiveShipStats, nextUpgradeCost } from './ships'
import {
  availableSkillPicks,
  availableStatPoints,
  captainCombatBonus,
  captainSpeedBonus,
  levelForXp,
} from './skills'
import {
  aggressiveTacticDriver,
  aiTacticDriver,
  cautiousTacticDriver,
  ORDER_CONDITIONS,
  plainTacticDriver,
  recordedTacticsDriver,
  resolveTacticalCombat,
  standingOrdersDriver,
  tacticPlanDriver,
  TACTICS,
  type TacticDriver,
} from './tactics'
import type {
  AllianceState,
  Captain,
  CityState,
  GameSetup,
  GameState,
  LandingParty,
  MarchOrder,
  PlayerState,
  SailOrder,
  TroopStack,
} from './types'
import { accumulateExploredTiles, currentContacts, tileKey, tilesInRadius } from './visibility'

/**
 * What a captain learned from resolving a random encounter (#23) — the result of
 * the seeded roll, surfaced to the client's outcome dialog. Fully derived from the
 * pre-action RNG state, so replays reproduce it exactly.
 */
export interface EncounterOutcome {
  encounterId: string
  kind: EncounterKind | LandEncounterKind
  choice: string
  success: boolean
  reward: Partial<ResourcePool>
  xpGained: number
  troopsGained?: TroopStack
  troopsLost: TroopStack[]
  /** Item dropped by a successful encounter (#498), granted to the captain (or the stash). */
  itemGained?: string
}

/**
 * Optional structured result of the last action, surfaced to the client without
 * living in the (replayable) GameState. Combat and encounters each produce one.
 */
export interface ActionOutcome {
  state: GameState
  battleReport?: BattleReport
  encounterOutcome?: EncounterOutcome
}

/**
 * The single entry point for mutating game state. Pure: returns a new state,
 * never touches the input. Throws InvalidActionError for illegal actions —
 * the server rejects these; a well-behaved client never produces them.
 */
export function applyAction(state: GameState, action: Action): GameState {
  return applyActionWithOutcome(state, action).state
}

/**
 * Like {@link applyAction}, but also returns any structured side output (e.g. a
 * combat {@link BattleReport}) for the client to display. The report is fully
 * derived from the pre-action RNG state, so replays reproduce it exactly.
 */
export function applyActionWithOutcome(state: GameState, action: Action): ActionOutcome {
  if (state.config.rulesVersion !== RULES_VERSION) {
    throw new RulesVersionMismatchError(state.config.rulesVersion, RULES_VERSION)
  }
  if (state.status !== 'active') {
    throw new InvalidActionError('Game is over', action)
  }
  if (currentPlayer(state).id !== action.playerId) {
    throw new InvalidActionError(`Not ${action.playerId}'s turn`, action)
  }

  let next: GameState
  let battleReport: BattleReport | undefined
  let encounterOutcome: EncounterOutcome | undefined
  switch (action.type) {
    case 'endTurn':
      next = advanceTurn(state)
      break
    case 'resign':
      next = advanceTurn(eliminatePlayer(state, action.playerId))
      break
    case 'moveCaptain':
      next = moveCaptain(state, action)
      break
    case 'attackCaptain': {
      const result = attackCaptain(state, action)
      next = result.state
      battleReport = result.battleReport
      break
    }
    case 'attackCity': {
      const result = attackCity(state, action)
      next = result.state
      battleReport = result.battleReport
      break
    }
    case 'disembark':
      next = disembark(state, action)
      break
    case 'moveParty':
      next = moveParty(state, action)
      break
    case 'embark':
      next = embark(state, action)
      break
    case 'attackParty': {
      const result = attackParty(state, action)
      next = result.state
      battleReport = result.battleReport
      break
    }
    case 'partyAssaultCity': {
      const result = partyAssaultCity(state, action)
      next = result.state
      battleReport = result.battleReport
      break
    }
    case 'setSailOrder':
      next = setSailOrder(state, action)
      break
    case 'clearSailOrder':
      next = clearSailOrder(state, action)
      break
    case 'setMarchOrder':
      next = setMarchOrder(state, action)
      break
    case 'clearMarchOrder':
      next = clearMarchOrder(state, action)
      break
    case 'setStandingOrders':
      next = setStandingOrders(state, action)
      break
    case 'construct':
      next = construct(state, action)
      break
    case 'recruit':
      next = recruit(state, action)
      break
    case 'recruitCaptain':
      next = recruitCaptain(state, action)
      break
    case 'ransomCaptain':
      next = ransomCaptain(state, action)
      break
    case 'transferTroops':
      next = transferTroops(state, action)
      break
    case 'gainCaptainXp':
      next = gainCaptainXp(state, action)
      break
    case 'chooseCaptainSkill':
      next = chooseCaptainSkill(state, action)
      break
    case 'chooseCaptainStat':
      next = chooseCaptainStat(state, action)
      break
    case 'garrisonCaptain':
      next = garrisonCaptain(state, action)
      break
    case 'ungarrisonCaptain':
      next = ungarrisonCaptain(state, action)
      break
    case 'takeItem':
      next = takeItem(state, action)
      break
    case 'depositItem':
      next = depositItem(state, action)
      break
    case 'upgradeShip':
      next = upgradeShip(state, action)
      break
    case 'resolveEncounter': {
      const result = resolveEncounter(state, action)
      next = result.state
      encounterOutcome = result.outcome
      break
    }
    case 'captureSite':
      next = captureSite(state, action)
      break
    case 'resolvePartyEncounter': {
      const result = resolvePartyEncounter(state, action)
      next = result.state
      encounterOutcome = result.outcome
      break
    }
    case 'proposeAlliance':
      next = proposeAlliance(state, action)
      break
    case 'acceptAlliance':
      next = acceptAlliance(state, action)
      break
    case 'leaveAlliance':
      next = leaveAlliance(state, action)
      break
  }

  // Fold newly-visible tiles (cities + captain positions) into the acting
  // player's exploration history — the persistent half of the fog of war (#14).
  next = {
    ...next,
    exploredTiles: {
      ...next.exploredTiles,
      [action.playerId]: accumulateExploredTiles(next, action.playerId),
    },
  }

  const outcome: ActionOutcome = { state: { ...next, actionCount: state.actionCount + 1 } }
  if (battleReport) outcome.battleReport = battleReport
  if (encounterOutcome) outcome.encounterOutcome = encounterOutcome
  return outcome
}

/** Content catalog frozen into the match config; required by the economy/city/skill actions. */
function requireContent(state: GameState, action: Action): ContentCatalog {
  const content = state.config.content
  if (!content) {
    throw new InvalidActionError('No content catalog configured for this match', action)
  }
  return content
}

function troopCount(troops: TroopStack[], unitId: string): number {
  return troops.find((t) => t.unitId === unitId)?.count ?? 0
}

/** Add `delta` (may be negative) of `unitId` to a troop list, dropping empty stacks. */
function adjustTroops(troops: TroopStack[], unitId: string, delta: number): TroopStack[] {
  const next = troops.map((t) => ({ ...t }))
  const existing = next.find((t) => t.unitId === unitId)
  if (existing) existing.count += delta
  else next.push({ unitId, count: delta })
  return next.filter((t) => t.count > 0)
}

function moveCaptain(state: GameState, action: MoveCaptainAction): GameState {
  const captain = state.captains.find((c) => c.id === action.captainId)
  if (!captain) throw new InvalidActionError(`No captain ${action.captainId}`, action)
  if (captain.ownerId !== action.playerId) {
    throw new InvalidActionError(`Captain ${action.captainId} is not yours`, action)
  }
  if (captain.captured) {
    throw new InvalidActionError(`Captain ${action.captainId} is captured and cannot act`, action)
  }
  requireShipControl(state, captain, action)
  if (!tileAt(state.map, action.to)) {
    throw new InvalidActionError(`Destination ${action.to.x},${action.to.y} is off-map`, action)
  }

  const path = findPath(state.map, captain.position, action.to)
  if (!path) throw new InvalidActionError('Destination is not reachable by sea', action)

  const cost = path.length - 1
  if (cost > captain.movementPoints) {
    throw new InvalidActionError(
      `Move costs ${cost} but captain has ${captain.movementPoints} movement`,
      action,
    )
  }

  // Reveal every tile the captain sailed over, not just the destination (#295).
  // Only exploredTiles (persistent) accumulates the path; currentlyVisibleTiles
  // (live vision) is derived from current positions only, via the post-action
  // fold below — a ship doesn't retain live vision over its wake.
  const { captainVisionRadius } = state.config.setup
  const explored = new Set(state.exploredTiles[action.playerId] ?? [])
  for (const step of path) {
    for (const tile of tilesInRadius(step, captainVisionRadius, state.map)) {
      explored.add(tileKey(tile))
    }
  }

  return {
    ...state,
    captains: state.captains.map((c) =>
      c.id === captain.id
        ? // A manual move overrides any standing sail order (#372).
          withSailOrder(
            { ...c, position: { ...action.to }, movementPoints: c.movementPoints - cost },
            undefined,
          )
        : c,
    ),
    exploredTiles: {
      ...state.exploredTiles,
      [action.playerId]: Array.from(explored),
    },
  }
}

// --- Multi-turn sail orders (#372) -------------------------------------------

/** Set or drop a captain's sail order, leaving no stray `undefined` key when dropped. */
function withSailOrder(captain: Captain, order: SailOrder | undefined): Captain {
  if (order) return { ...captain, sailOrder: order }
  if (captain.sailOrder === undefined) return captain
  const next = { ...captain }
  delete next.sailOrder
  return next
}

function clearSailOrderOn(state: GameState, captainId: string): GameState {
  return {
    ...state,
    captains: state.captains.map((c) => (c.id === captainId ? withSailOrder(c, undefined) : c)),
  }
}

/**
 * The live position of a sail order's target, or `null` if it is no longer a
 * valid quarry: a captured/sunk captain, a captured-back or self-owned city, a
 * consumed encounter. A `null` here voids the order (#372: target lost → clear).
 */
function sailTargetPosition(state: GameState, order: SailOrder, playerId: string): Coord | null {
  if (order.targetKind === 'captain') {
    const c = state.captains.find((c) => c.id === order.targetId)
    return c && !c.captured && c.ownerId !== playerId ? c.position : null
  }
  if (order.targetKind === 'city') {
    const city = state.cities.find((c) => c.id === order.targetId)
    return city && city.ownerId !== playerId ? city.position : null
  }
  if (order.targetKind === 'encounter') {
    const e = state.encounters.find((e) => e.id === order.targetId)
    return e && e.active ? e.position : null
  }
  return null
}

/** Has the captain reached its order — the destination tile, or within striking range of a target? */
function sailArrived(map: GameMap, position: Coord, order: SailOrder, targetPos: Coord): boolean {
  return order.targetId
    ? mapDistance(map, position, targetPos) <= 1
    : coordsEqual(position, order.destination)
}

/**
 * The lowest-cost reachable water tile *beside* `targetPos` — where an intercept
 * stops, one tile short of the quarry, so arrival never auto-attacks (D-027).
 * `null` if no water neighbour is reachable this position. Ties break by tile
 * index for determinism.
 */
function approachTile(map: GameMap, from: Coord, targetPos: Coord): Coord | null {
  let best: Coord | null = null
  let bestCost = Infinity
  let bestIdx = Infinity
  for (const n of mapNeighbors(map, targetPos)) {
    if (!isWaterTile(tileAt(map, n))) continue
    const cost = pathCost(map, from, n)
    if (cost === null) continue
    const idx = tileIndex(map, n.x, n.y)
    if (cost < bestCost || (cost === bestCost && idx < bestIdx)) {
      best = n
      bestCost = cost
      bestIdx = idx
    }
  }
  return best
}

/**
 * Advance one captain's standing sail order (#372) as far as this turn's
 * movement allows. Re-aims at the live target each call (intercept
 * recomputation), then walks the water route one tile at a time — revealing
 * tiles as it goes — and stops the instant it arrives, runs out of movement or
 * navigable water, or a NEW contact comes into view. In that last case the order
 * pauses (`interrupted`) and waits for the player; otherwise its `knownContactIds`
 * baseline is refreshed so the same contacts don't re-trigger next turn. On
 * arrival (or a vanished target) the order is cleared. Pure — returns new state.
 *
 * Used both for the first leg at set-order time and for every turn-start
 * continuation, so both paths share one code path (and one replay contract).
 */
function advanceSailOrder(state: GameState, captainId: string, playerId: string): GameState {
  const captain = state.captains.find((c) => c.id === captainId)
  if (!captain?.sailOrder || captain.captured) return state
  const order = captain.sailOrder

  const targetPos = order.targetId ? sailTargetPosition(state, order, playerId) : order.destination
  if (targetPos === null) return clearSailOrderOn(state, captainId) // target lost → void
  if (sailArrived(state.map, captain.position, order, targetPos)) {
    return clearSailOrderOn(state, captainId)
  }

  const { captainVisionRadius } = state.config.setup
  const known = new Set(order.knownContactIds)
  const explored = new Set(state.exploredTiles[playerId] ?? [])

  let position = captain.position
  let movementPoints = captain.movementPoints
  // Pre-move: a new contact already in view at turn start pauses without a stray
  // step (an enemy that moved adjacent while this captain sat still).
  let contactsHere = currentContacts(state, playerId)
  let interrupted = contactsHere.some((id) => !known.has(id))

  if (!interrupted && movementPoints > 0) {
    const legDest = order.targetId ? approachTile(state.map, position, targetPos) : targetPos
    const path = legDest && findPath(state.map, position, legDest)
    if (path && path.length >= 2) {
      for (const coord of tilesInRadius(position, captainVisionRadius, state.map)) {
        explored.add(tileKey(coord))
      }
      // Walk one tile at a time so a new sighting stops us AT the tile it appeared.
      for (let i = 1; i < path.length && movementPoints > 0; i++) {
        position = path[i]!
        movementPoints -= 1
        for (const coord of tilesInRadius(position, captainVisionRadius, state.map)) {
          explored.add(tileKey(coord))
        }
        // Recompute from a state where only this captain has advanced, so a
        // sighting this very step (own movement uncovering an enemy) counts.
        const scouted = withCaptainProgress(state, captainId, position, explored, playerId)
        contactsHere = currentContacts(scouted, playerId)
        if (contactsHere.some((id) => !known.has(id))) {
          interrupted = true
          break
        }
        if (sailArrived(state.map, position, order, targetPos)) break
      }
    }
  }

  const arrived = !interrupted && sailArrived(state.map, position, order, targetPos)
  const nextOrder: SailOrder | undefined = arrived
    ? undefined
    : interrupted
      ? { ...order, knownContactIds: contactsHere, interrupted: true }
      : { ...order, knownContactIds: contactsHere }

  return {
    ...state,
    captains: state.captains.map((c) =>
      c.id === captainId ? withSailOrder({ ...c, position, movementPoints }, nextOrder) : c,
    ),
    exploredTiles: { ...state.exploredTiles, [playerId]: Array.from(explored) },
  }
}

/** State with just `captainId` moved to `position` and `playerId`'s explored set updated — for the per-step contact scan. */
function withCaptainProgress(
  state: GameState,
  captainId: string,
  position: Coord,
  explored: Set<string>,
  playerId: string,
): GameState {
  return {
    ...state,
    captains: state.captains.map((c) => (c.id === captainId ? { ...c, position } : c)),
    exploredTiles: { ...state.exploredTiles, [playerId]: Array.from(explored) },
  }
}

/**
 * Give a captain a standing sail order (#372) and immediately sail this turn's
 * leg. `destination` must be reachable water (fixed-tile order) or an intercept
 * whose target is a live enemy with a reachable approach tile.
 */
function setSailOrder(state: GameState, action: SetSailOrderAction): GameState {
  const captain = state.captains.find((c) => c.id === action.captainId)
  if (!captain) throw new InvalidActionError(`No captain ${action.captainId}`, action)
  if (captain.ownerId !== action.playerId) {
    throw new InvalidActionError(`Captain ${action.captainId} is not yours`, action)
  }
  if (captain.captured) {
    throw new InvalidActionError(`Captain ${action.captainId} is captured and cannot act`, action)
  }
  requireShipControl(state, captain, action)
  if (!tileAt(state.map, action.destination)) {
    throw new InvalidActionError(
      `Destination ${action.destination.x},${action.destination.y} is off-map`,
      action,
    )
  }

  let order: SailOrder
  if (action.targetId !== undefined) {
    if (action.targetKind === undefined) {
      throw new InvalidActionError('A sail order target requires a targetKind', action)
    }
    const probe: SailOrder = {
      destination: action.destination,
      targetId: action.targetId,
      targetKind: action.targetKind,
      knownContactIds: [],
    }
    const targetPos = sailTargetPosition(state, probe, action.playerId)
    if (targetPos === null) {
      throw new InvalidActionError(
        `Sail target ${action.targetId} is not a valid ${action.targetKind}`,
        action,
      )
    }
    if (mapDistance(state.map, captain.position, targetPos) <= 1) {
      throw new InvalidActionError('Sail target is already within reach', action)
    }
    if (!approachTile(state.map, captain.position, targetPos)) {
      throw new InvalidActionError('Sail target is not reachable by sea', action)
    }
    order = {
      destination: { ...action.destination },
      targetId: action.targetId,
      targetKind: action.targetKind,
      knownContactIds: currentContacts(state, action.playerId),
    }
  } else {
    if (!isWaterTile(tileAt(state.map, action.destination))) {
      throw new InvalidActionError('Sail destination is not water', action)
    }
    if (coordsEqual(captain.position, action.destination)) {
      throw new InvalidActionError('Sail destination is already the current tile', action)
    }
    if (!findPath(state.map, captain.position, action.destination)) {
      throw new InvalidActionError('Sail destination is not reachable by sea', action)
    }
    order = {
      destination: { ...action.destination },
      knownContactIds: currentContacts(state, action.playerId),
    }
  }

  const withOrder: GameState = {
    ...state,
    captains: state.captains.map((c) => (c.id === captain.id ? withSailOrder(c, order) : c)),
  }
  return advanceSailOrder(withOrder, captain.id, action.playerId)
}

/** Cancel a captain's standing sail order (#372). Idempotent — valid with none set. */
function clearSailOrder(state: GameState, action: ClearSailOrderAction): GameState {
  const captain = state.captains.find((c) => c.id === action.captainId)
  if (!captain) throw new InvalidActionError(`No captain ${action.captainId}`, action)
  if (captain.ownerId !== action.playerId) {
    throw new InvalidActionError(`Captain ${action.captainId} is not yours`, action)
  }
  return clearSailOrderOn(state, action.captainId)
}

/**
 * At the start of `playerId`'s turn (after movement refresh), continue every one
 * of their captains' standing sail orders (#372). A paused (interrupted) order
 * is skipped — it waits for the player to re-issue or clear it.
 */
function autoContinueSailOrders(state: GameState, playerId: string): GameState {
  const ids = state.captains
    .filter((c) => c.ownerId === playerId && !c.captured && c.sailOrder && !c.sailOrder.interrupted)
    .map((c) => c.id)
  let working = state
  for (const id of ids) working = advanceSailOrder(working, id, playerId)
  return working
}

/**
 * Mark a seat dead and sweep its pieces off the board (#208). A resigned seat's
 * captains would otherwise sit as ghost fleets — free combat-XP farms that also
 * squat resource nodes — and its cities would keep replenishing recruit pools
 * and drawing AI aggression forever.
 */
function eliminatePlayer(state: GameState, playerId: string): GameState {
  return {
    ...state,
    players: state.players.map((p) => (p.id === playerId ? { ...p, eliminated: true } : p)),
    // Any captives this seat was holding are released toward their owners'
    // recruitment pools (#309) before its own (dead) captains are swept.
    captains: releaseCaptivesHeldBy(
      state.captains.filter((c) => c.ownerId !== playerId),
      playerId,
      state.round,
    ),
    cities: state.cities.filter((c) => c.ownerId !== playerId),
    parties: state.parties.filter((p) => p.ownerId !== playerId),
    // A dead seat leaves every alliance and drops its pending proposals (#136).
    alliances: pruneAlliancesForSeats(state.alliances, new Set([playerId])),
  }
}

/**
 * Release every captive held by `captorId` back toward its owner's
 * recruitment pool (#309): its captor identity is gone (resigned or
 * eliminated) so it becomes immediately eligible for `recruitCaptain`,
 * exactly like a paid ransom, rather than being stranded with no one left to
 * pay.
 */
function releaseCaptivesHeldBy(captains: Captain[], captorId: string, round: number): Captain[] {
  return captains.map((c) => {
    if (!c.captured || c.capturedBy !== captorId) return c
    const released: Captain = { ...c, captivityReturnRound: round }
    delete released.capturedBy
    return released
  })
}

/** A prize captain (#374) plus the {@link BattleReport.prizeShip} metadata it produces. */
export interface PrizeSpawn {
  captain: Captain
  report: NonNullable<BattleReport['prizeShip']>
}

/**
 * The prize a decisive naval victory (#374) hands the winner: the defeated
 * captain's hull as a fresh, empty-crewed "prize captain" (level 1, no skills,
 * no troops, copied ship class + upgrades), spawned on the defeated ship's tile.
 * Null on any non-decisive result — an escape or a mutual-survival draw leaves
 * both sides afloat (both `*Survived`), so no capture and no prize. Pure and
 * shared by the reducer (which spawns the captain) and the client battle probe
 * (which previews the report), so both agree on the report's prizeShip byte for
 * byte. The prize id keys off `actionCount`, so it stays deterministic and
 * replay-stable.
 */
export function prizeSpawnFor(
  report: BattleReport,
  attacker: Captain,
  defender: Captain,
  actionCount: number,
  setup: GameSetup,
): PrizeSpawn | null {
  const loser = !report.attackerSurvived ? attacker : !report.defenderSurvived ? defender : null
  if (!loser) return null
  const captain: Captain = {
    id: `prize-${actionCount}`,
    ownerId: report.winnerId,
    name: `Prize of the ${loser.shipClassId.charAt(0).toUpperCase()}${loser.shipClassId.slice(1)}`,
    position: { ...loser.position },
    shipClassId: loser.shipClassId,
    // No movement the turn it is taken; refreshes to a full allowance on the
    // winner's next turn like any other captain.
    movementPoints: 0,
    maxMovementPoints: setup.startingCaptainMovement,
    troops: [],
    xp: 0,
    skills: [],
    stats: { attack: 0, defense: 0, speed: 0 },
    items: [],
    shipUpgrades: { ...loser.shipUpgrades },
    captured: false,
  }
  return {
    captain,
    report: {
      captainId: captain.id,
      shipClassId: captain.shipClassId,
      newOwnerId: captain.ownerId,
    },
  }
}

/**
 * Turn a decisively-beaten captain into a captive of `capturedBy` (#309): held,
 * stripped of troops and movement, and — since a captive cannot act — with any
 * standing sail order (#372) dropped. Shared by ship duels and city assaults.
 */
function captureCaptain(
  captain: Captain,
  capturedBy: string,
  captivityReturnRound: number,
): Captain {
  const captured: Captain = {
    ...captain,
    captured: true,
    capturedBy,
    captivityReturnRound,
    troops: [],
    movementPoints: 0,
    maxMovementPoints: 0,
  }
  delete captured.sailOrder
  // A ship-lost captain captured ashore (#498) is a plain captive from here on;
  // a later rehire must not resurrect the flag.
  delete captured.shipLost
  return captured
}

/**
 * A captain whose anchored flagship was defeated while the captain was ashore
 * leading `party` (#498): the hull is gone (prize flow), the captain is not —
 * it stands with its party, shipless; if the party is destroyed the captain is
 * captured. Any crew still aboard went down with the ship.
 */
function shipLostCaptain(captain: Captain, party: LandingParty): Captain {
  const stranded: Captain = {
    ...captain,
    shipLost: true,
    position: { ...party.position },
    troops: [],
    movementPoints: 0,
  }
  delete stranded.sailOrder
  return stranded
}

/**
 * Build a combatant, layering in this captain's ship upgrades (#22) and skill
 * bonuses (#21). Faction has no effect on combat stats (bonuses come from
 * skills/upgrades) — see #215.
 */
export function captainToCombatant(
  captain: Captain,
  content: ContentCatalog | undefined,
): Combatant {
  const combatant: Combatant = {
    captainId: captain.id,
    ownerId: captain.ownerId,
    shipClassId: captain.shipClassId,
    troops: captain.troops,
  }
  if (!content) return combatant
  const shipDef = content.ships[captain.shipClassId]
  if (shipDef) {
    const eff = effectiveShipStats(shipDef, captain.shipUpgrades)
    combatant.shipStats = { hull: eff.hull, cannons: eff.cannons, speed: eff.speed }
  }
  const bonus = captainCombatBonus(captain, content)
  combatant.attackBonusPct = bonus.attackBonusPct
  combatant.defenseBonusPct = bonus.defenseBonusPct
  combatant.attackFlatBonus = bonus.attackFlatBonus
  combatant.defenseFlatBonus = bonus.defenseFlatBonus
  return combatant
}

/**
 * A captain's ship as a naval combatant, aware of the captain's whereabouts
 * (#498): identical to {@link captainToCombatant}, except an anchored ship
 * whose captain is ashore leading a party fights with its remaining crew
 * alone — the absent captain's skill/stat/item bonuses are ashore with the
 * party. Shared by the reducer and the client battle probes so previews and
 * authoritative resolution stay byte-identical.
 */
export function navalCombatant(
  state: GameState,
  captain: Captain,
  content: ContentCatalog | undefined,
): Combatant {
  const combatant = captainToCombatant(captain, content)
  if (partyLedBy(state, captain.id)) {
    delete combatant.attackBonusPct
    delete combatant.defenseBonusPct
    delete combatant.attackFlatBonus
    delete combatant.defenseFlatBonus
  }
  return combatant
}

/** A city's garrison as an ordered troop list — sorted by unit id so the board
 * deployment (and thus the whole battle) is deterministic regardless of the
 * garrison record's key-insertion order. */
export function garrisonToTroops(garrison: Record<string, number>): TroopStack[] {
  return Object.entries(garrison)
    .filter(([, count]) => count > 0)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([unitId, count]) => ({ unitId, count }))
}

/**
 * The full defender troop list for a city assault (#435): its recruited garrison,
 * plus — when the catalog carries city-defense tuning — automatic militia and
 * turrets it fields for free, reconstituted fresh every battle. Derived here at
 * battle time from the city's own state so nothing new is persisted in
 * GameState:
 *
 * - **Militia**: `militiaPerType` of every unit the city can recruit (the arming
 *   faction's units at or below the city's unlocked recruit tier), merged into
 *   the garrison counts. Merging (rather than a separate stack) means combat
 *   casualties fall on the free militia before the recruited troops — the
 *   garrison a successful defense keeps is clamped back to what was recruited.
 * - **Turrets**: `turretCount` stationary ranged pieces whose stats @aop/content
 *   derives from the highest-tier available unit (see `turretUnitId`). The turret
 *   tier is the highest tier that actually exists in the arming roster at or
 *   below the unlocked tier — @aop/content bakes a turret stat row for exactly
 *   the tiers present in each roster, so a gappy roster (or a building unlocking
 *   a tier with no unit) can never name a turret id with no stats behind it.
 *   Appended last so the board's per-side stack cap sheds turrets before
 *   recruited troops.
 *
 * `factionId` is the owning player's faction; `undefined` for a neutral (unowned)
 * city, which arms from the tuning's neutral roster. With no city-defense tuning
 * (pre-#435 snapshots, minimal catalogs) this is just the sorted garrison.
 */
export function cityDefenderTroops(
  city: CityState,
  content: ContentCatalog | undefined,
  factionId: string | undefined,
): TroopStack[] {
  const base = garrisonToTroops(city.garrison)
  const cd = content?.cityDefense
  if (!content || !cd) return base
  const roster = factionId ?? cd.neutralRosterFactionId
  const tier = unlockedRecruitTier(city, content)
  if (tier <= 0) return base

  const counts = new Map(base.map((t) => [t.unitId, t.count]))
  let turretTier = 0
  for (const [unitId, def] of Object.entries(content.units)) {
    if (def.factionId === roster && def.tier <= tier) {
      counts.set(unitId, (counts.get(unitId) ?? 0) + cd.militiaPerType)
      if (def.tier > turretTier) turretTier = def.tier
    }
  }
  const troops = [...counts.entries()]
    .filter(([, count]) => count > 0)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([unitId, count]) => ({ unitId, count }))

  // turretTier is 0 only when the roster has no unit at or below the unlocked
  // tier — then there is nothing to derive a turret from, and no militia either.
  if (turretTier > 0) {
    const turretId = turretUnitId(roster, turretTier)
    for (let i = 0; i < cd.turretCount; i++) troops.push({ unitId: turretId, count: 1 })
  }
  return troops
}

/**
 * Build the defending combatant for a city assault (#344): the garrison plus its
 * automatic militia and turrets (#435, see {@link cityDefenderTroops}), no ship
 * (a city has none — zeroed ship stats keep it out of the strength math), and a
 * fortification defense bonus summed from the city's standing buildings.
 * Fortification numbers are balance data — they live in @aop/content's building
 * defs (`defenseBonus`), never hardcoded here. Exported so the AI can score an
 * assault against the same defender the reducer resolves. `factionId` is the
 * city owner's faction (`undefined` for a neutral city → tuning's neutral roster).
 *
 * `portDefenders` (#498) are the owner's ships defending the harbor — the
 * garrisoned captain plus every own captain in port (see
 * {@link cityPortDefenders}). Each contributes its effective hull and cannons
 * to the combatant's ship strength and its captain's combat bonuses to the
 * shared channels — skill percentages and stat flat adds (stats + carried
 * items) each summed across defenders — so both the reducer's resolution and
 * the AI's `combatantStrength` scoring see a defended port as materially
 * harder to crack.
 */
export function cityToCombatant(
  city: CityState,
  content: ContentCatalog | undefined,
  factionId?: string,
  portDefenders?: readonly Captain[],
): Combatant {
  const combatant: Combatant = {
    captainId: city.id,
    ownerId: city.ownerId,
    shipClassId: '',
    troops: cityDefenderTroops(city, content, factionId),
    shipStats: { hull: 0, cannons: 0, speed: 0 },
  }
  if (content) {
    let attackBonusPct = 0
    let defenseBonusPct = city.buildings.reduce(
      (sum, b) => sum + (content.buildings[b]?.defenseBonus ?? 0),
      0,
    )
    let attackFlatBonus = 0
    let defenseFlatBonus = 0
    for (const cap of portDefenders ?? []) {
      const shipDef = content.ships[cap.shipClassId]
      if (shipDef) {
        const eff = effectiveShipStats(shipDef, cap.shipUpgrades)
        combatant.shipStats!.hull += eff.hull
        combatant.shipStats!.cannons += eff.cannons
      }
      const bonus = captainCombatBonus(cap, content)
      attackBonusPct += bonus.attackBonusPct
      defenseBonusPct += bonus.defenseBonusPct
      attackFlatBonus += bonus.attackFlatBonus
      defenseFlatBonus += bonus.defenseFlatBonus
    }
    if (attackBonusPct > 0) combatant.attackBonusPct = attackBonusPct
    if (defenseBonusPct > 0) combatant.defenseBonusPct = defenseBonusPct
    if (attackFlatBonus > 0) combatant.attackFlatBonus = attackFlatBonus
    if (defenseFlatBonus > 0) combatant.defenseFlatBonus = defenseFlatBonus
  }
  return combatant
}

/**
 * The owner's ships defending a city's harbor (#498): the garrisoned captain
 * and every other own captain in port — within one tile of the city — that is
 * not captured, not ashore leading a party, and not shipless. They join the
 * city's defence automatically when an assault resolves (sea or land), and are
 * ALL captured if the city falls. Exported so the reducer, the AI's assault
 * scoring, and the client probes all see the identical defender set.
 */
export function cityPortDefenders(state: GameState, city: CityState): Captain[] {
  return state.captains.filter(
    (c) =>
      c.ownerId === city.ownerId &&
      !c.captured &&
      !c.shipLost &&
      !state.parties.some((p) => p.captainId === c.id) &&
      mapDistance(state.map, c.position, city.position) <= 1,
  )
}

/**
 * The combat AI driver a seat fights with when it has no player-supplied orders
 * (#25). Human seats and unprofiled AIs use the default; profiled AIs get a
 * personality-flavored driver, with `easy` deliberately playing the weak line.
 * `tactics` is the match's frozen tuning (#212) — the thresholds these drivers
 * key on are balance data, never hardcoded in the engine. Exported so the
 * interactive-combat probes (`probe.ts`, #93/#305) select the exact same
 * defender/attacker driver the reducer will, keeping probe and replay in sync.
 */
export function aiTacticDriverForOwner(
  state: GameState,
  ownerId: string,
  tactics: TacticsTuning,
): TacticDriver {
  const profile = state.players.find((p) => p.id === ownerId)?.aiProfile
  if (!profile) return aiTacticDriver(tactics)
  if (profile.difficulty === 'easy') return plainTacticDriver
  if (profile.personality === 'aggressive') return aggressiveTacticDriver(tactics)
  if (profile.personality === 'economic') return cautiousTacticDriver(tactics)
  return aiTacticDriver(tactics)
}

function attackCaptain(
  state: GameState,
  action: AttackCaptainAction,
): { state: GameState; battleReport: BattleReport } {
  const attacker = state.captains.find((c) => c.id === action.captainId)
  if (!attacker) throw new InvalidActionError(`No captain ${action.captainId}`, action)
  if (attacker.ownerId !== action.playerId) {
    throw new InvalidActionError(`Captain ${action.captainId} is not yours`, action)
  }
  if (attacker.captured) {
    throw new InvalidActionError(`Captain ${action.captainId} is captured and cannot act`, action)
  }
  requireShipControl(state, attacker, action)
  const target = state.captains.find((c) => c.id === action.targetCaptainId)
  if (!target) throw new InvalidActionError(`No captain ${action.targetCaptainId}`, action)
  if (target.ownerId === action.playerId) {
    throw new InvalidActionError('Cannot attack your own captain', action)
  }
  if (target.captured) {
    throw new InvalidActionError(`Captain ${action.targetCaptainId} is already captured`, action)
  }
  if (target.shipLost) {
    throw new InvalidActionError(`${target.id} has no ship to attack — engage its party ashore`, action) // prettier-ignore
  }
  if (garrisonCityOf(state, target.id)) {
    throw new InvalidActionError(`${target.id} is garrisoned — assault the city instead`, action)
  }
  if (mapDistance(state.map, attacker.position, target.position) > 1) {
    throw new InvalidActionError('Target is not within attack range', action)
  }
  if (attacker.movementPoints < 1) {
    throw new InvalidActionError('Captain has no movement left to attack', action)
  }
  if (!state.config.combatStats) {
    throw new InvalidActionError('No combat stats configured for this match', action)
  }
  for (const tactic of action.attackerOrders ?? []) {
    if (!TACTICS.includes(tactic)) {
      throw new InvalidActionError(`Unknown tactic '${tactic}' in attacker orders`, action)
    }
  }
  for (const tactic of action.defenderOrders ?? []) {
    if (!TACTICS.includes(tactic)) {
      throw new InvalidActionError(`Unknown tactic '${tactic}' in defender orders`, action)
    }
  }
  for (const command of action.boardCommands ?? []) {
    if (!isValidBoardCommand(command)) {
      throw new InvalidActionError('Malformed board command in attacker plan', action)
    }
  }
  for (const command of action.defenderBoardCommands ?? []) {
    if (!isValidBoardCommand(command)) {
      throw new InvalidActionError('Malformed board command in defender plan', action)
    }
  }

  const stats = createCombatStats(state.config.combatStats)
  const content = state.config.content

  // The attacker plays its submitted plan; the defender fights by the standing
  // orders its own owner saved in state (never anything the attacker supplies)
  // UNLESS the server authored the defender's interactive picks (#418, D-029):
  // `defenderOrders`/`defenderBoardCommands` are populated only by the battle-
  // session resolver from the defender's own authenticated submissions, and the
  // recorded prefix plays out with the standing-orders/doctrine tail beyond it.
  // Either side without orders is driven by the combat AI — auto-resolve.
  const defenderTacticFallback: TacticDriver = target.standingOrders?.length
    ? standingOrdersDriver(target.standingOrders, stats.tactics.outgunnedRatio)
    : aiTacticDriverForOwner(state, target.ownerId, stats.tactics)
  const result: CombatResult = resolveTacticalCombat(
    {
      attacker: navalCombatant(state, attacker, content),
      defender: navalCombatant(state, target, content),
    },
    stats,
    state.rngState,
    {
      attacker: action.attackerOrders?.length
        ? tacticPlanDriver(action.attackerOrders)
        : aiTacticDriverForOwner(state, attacker.ownerId, stats.tactics),
      // Interactive defender (#418): recorded picks count, standing orders → AI
      // finish the tail (D-029 §10.5). Absent `defenderOrders`, this is the
      // fallback alone — byte-identical to the previous standing-orders behavior.
      defender: action.defenderOrders?.length
        ? recordedTacticsDriver(action.defenderOrders, defenderTacticFallback)
        : defenderTacticFallback,
      // Board melee (#39): the attacker plays its recorded commands if it
      // submitted any (the single-player interactive picker, #93 — it can
      // probe the live RNG state to build one). Lacking that, it falls back
      // to its own saved board doctrine, exactly like the defender always
      // does (#285): a multiplayer attacker has no RNG access to probe with,
      // so pre-committing a doctrine via standing orders is its only way to
      // have a say in the melee instead of ceding it outright to the board
      // AI. Either side with neither is driven by the board AI.
      ...(action.boardCommands?.length
        ? { attackerBoard: boardPlanDriver(action.boardCommands) }
        : attacker.boardOrders?.length
          ? { attackerBoard: boardOrdersDriver(attacker.boardOrders) }
          : {}),
      // Interactive defender melee (#418): recorded commands first, then the
      // target's board doctrine → board AI finish the tail (boardPlanDriver's
      // fallback defaults to the board AI when no doctrine is set). Absent
      // `defenderBoardCommands`, this is byte-identical to the previous branch.
      ...(action.defenderBoardCommands?.length
        ? {
            defenderBoard: boardPlanDriver(
              action.defenderBoardCommands,
              target.boardOrders?.length ? boardOrdersDriver(target.boardOrders) : undefined,
            ),
          }
        : target.boardOrders?.length
          ? { defenderBoard: boardOrdersDriver(target.boardOrders) }
          : {}),
    },
  )
  const { report } = result
  const winnerCaptainId = report.winnerId === attacker.ownerId ? attacker.id : target.id
  // combatWinXp is the prize for a decisive naval victory. An escape ends the
  // battle with both fleets afloat — awarding it then let an attacker farm XP
  // off a defender whose standing orders evade, one risk-free attack per turn
  // (#209).
  const combatWinXp = report.escapedId ? 0 : state.config.setup.combatWinXp

  // Write back survivors: a decisive loser is captured — not removed (#309) —
  // by the winning seat, stripped of troops and movement until ransomed or
  // its captivity round elapses. Survivors update troops/movement and the
  // winner banks combat XP (#21).
  const captivityReturnRound = state.round + state.config.setup.captainCaptivityRounds
  const captains = state.captains.map((c) => {
    const wonXp = c.id === winnerCaptainId ? combatWinXp : 0
    if (c.id === attacker.id) {
      if (!report.attackerSurvived) {
        return captureCaptain(c, target.ownerId, captivityReturnRound)
      }
      return { ...c, troops: result.attackerTroops, movementPoints: 0, xp: c.xp + wonXp }
    }
    if (c.id === target.id) {
      if (!report.defenderSurvived) {
        // A defeated anchored ship whose captain is ashore (#498): the hull is
        // lost (the prize below still mints), but the captain is NOT captured —
        // it stands with its party, which is now stranded.
        const ledParty = partyLedBy(state, c.id)
        if (ledParty) return shipLostCaptain(c, ledParty)
        return captureCaptain(c, attacker.ownerId, captivityReturnRound)
      }
      return { ...c, troops: result.defenderTroops, xp: c.xp + wonXp }
    }
    return c
  })

  // Prize ship (#374): a decisive naval victory hands the defeated captain's
  // hull to the winner as a fresh, empty-crewed "prize captain". Built by the
  // shared pure helper the client battle probe also uses, so the previewed
  // report and the authoritative one carry the same prizeShip.
  const prize = prizeSpawnFor(report, attacker, target, state.actionCount, state.config.setup)
  const captainsWithPrize = prize ? [...captains, prize.captain] : captains

  const { players, alliances } = betrayalAdjusted(state, attacker.ownerId, target.ownerId)

  const settled = settleEliminations({
    ...state,
    players,
    alliances,
    captains: captainsWithPrize,
    rngState: result.rng,
  })
  return { state: settled, battleReport: prize ? { ...report, prizeShip: prize.report } : report }
}

/**
 * Assault an adjacent enemy city (#344): the attacker's embarked troops storm
 * the garrison on the tactical board's land entry point ({@link resolveBoardCombat}).
 * A decisive attacker win flips the city's ownership — and the elimination check
 * that {@link settleEliminations} already runs turns a seat's last-city loss into
 * a conquest victory, the win condition that was previously unreachable. A failed
 * assault captures the attacking captain, exactly like a lost ship duel (#309).
 */
function attackCity(
  state: GameState,
  action: AttackCityAction,
): { state: GameState; battleReport: BattleReport } {
  const attacker = state.captains.find((c) => c.id === action.captainId)
  if (!attacker) throw new InvalidActionError(`No captain ${action.captainId}`, action)
  if (attacker.ownerId !== action.playerId) {
    throw new InvalidActionError(`Captain ${action.captainId} is not yours`, action)
  }
  if (attacker.captured) {
    throw new InvalidActionError(`Captain ${action.captainId} is captured and cannot act`, action)
  }
  requireShipControl(state, attacker, action)
  const target = state.cities.find((c) => c.id === action.targetCityId)
  if (!target) throw new InvalidActionError(`No city ${action.targetCityId}`, action)
  if (target.ownerId === action.playerId) {
    throw new InvalidActionError('Cannot assault your own city', action)
  }
  if (mapDistance(state.map, attacker.position, target.position) > 1) {
    throw new InvalidActionError('City is not within assault range', action)
  }
  if (attacker.movementPoints < 1) {
    throw new InvalidActionError('Captain has no movement left to assault', action)
  }
  if (attacker.troops.reduce((sum, t) => sum + t.count, 0) <= 0) {
    throw new InvalidActionError('Captain has no troops to land for an assault', action)
  }
  if (!state.config.combatStats) {
    throw new InvalidActionError('No combat stats configured for this match', action)
  }
  // A city assault is a land board battle; without board tuning there is no
  // board to fight it on (matches configured naval-only, or pre-#39 saves).
  if (!state.config.combatStats.battle) {
    throw new InvalidActionError('No board tuning configured — city assault is unavailable', action)
  }
  for (const command of action.boardCommands ?? []) {
    if (!isValidBoardCommand(command)) {
      throw new InvalidActionError('Malformed board command in attacker plan', action)
    }
  }

  const stats = createCombatStats(state.config.combatStats)
  const content = state.config.content

  // The attacker plays its recorded land-melee plan, or its saved board doctrine,
  // or the board AI — the same fallback chain as a boarding melee (#39/#93). The
  // garrison has no owner-supplied board orders, so it is always the board AI.
  const defenderFaction = state.players.find((p) => p.id === target.ownerId)?.faction
  // Port defense (#498): the garrisoned captain and every own ship in the
  // harbor join the city's defence — and are all captured if the city falls.
  const portDefenders = cityPortDefenders(state, target)
  const portDefenderIds = new Set(portDefenders.map((c) => c.id))
  const result = resolveBoardCombat(
    {
      attacker: captainToCombatant(attacker, content),
      defender: cityToCombatant(target, content, defenderFaction, portDefenders),
    },
    stats,
    state.rngState,
    action.boardCommands?.length
      ? { attacker: boardPlanDriver(action.boardCommands) }
      : attacker.boardOrders?.length
        ? { attacker: boardOrdersDriver(attacker.boardOrders) }
        : {},
    'land',
  )
  const { report } = result
  const attackerWon = report.attackerSurvived
  const combatWinXp = state.config.setup.combatWinXp
  const captivityReturnRound = state.round + state.config.setup.captainCaptivityRounds

  const captains = state.captains.map((c) => {
    if (c.id === attacker.id) {
      if (attackerWon) {
        return { ...c, troops: result.attackerTroops, movementPoints: 0, xp: c.xp + combatWinXp }
      }
      return captureCaptain(c, target.ownerId, captivityReturnRound)
    }
    // A fallen city takes its harbor down with it (#498): the garrisoned
    // captain and every in-port captain are captured by the conqueror.
    if (attackerWon && portDefenderIds.has(c.id)) {
      return captureCaptain(c, attacker.ownerId, captivityReturnRound)
    }
    return c
  })

  const cities = clearGarrisonMarkers(
    state.cities.map((c) => {
      if (c.id !== target.id) return c
      return attackerWon
        ? cityCaptured(c, attacker.ownerId)
        : cityAfterDefense(c, result.defenderTroops)
    }),
    attackerWon ? portDefenderIds : new Set(),
  )

  const { players, alliances } = betrayalAdjusted(state, attacker.ownerId, target.ownerId)

  const settled = settleEliminations({
    ...state,
    players,
    alliances,
    captains,
    cities,
    rngState: result.rng,
  })
  return { state: settled, battleReport: report }
}

/**
 * Betrayal accounting (#138/#177), shared by every attack action: striking an
 * ally is legal — no leave step required — but the alliance dissolves and the
 * attacker pays the reputation price in the same action as the battle itself
 * (never an intermediate state where an ally was attacked and the alliance
 * stands). Striking an ex-ally still inside the truce window counts equally
 * (#177): leaving first buys no free same-turn backstab. On a betrayal the
 * live pair is dropped and the truce entry cleared (so the same window can't
 * be billed twice); otherwise players/alliances pass through untouched.
 */
function betrayalAdjusted(
  state: GameState,
  attackerOwnerId: string,
  targetOwnerId: string,
): { players: PlayerState[]; alliances: AllianceState } {
  const truceRounds = state.config.setup.betrayalTruceRounds ?? 0
  const betrayal =
    areAllied(state, attackerOwnerId, targetOwnerId) ||
    wasAllyWithinTruce(state.alliances, attackerOwnerId, targetOwnerId, state.round, truceRounds)
  if (!betrayal) return { players: state.players, alliances: state.alliances }
  return {
    players: state.players.map((p) =>
      p.id === attackerOwnerId
        ? {
            ...p,
            reputation: Math.max(0, p.reputation - state.config.setup.betrayalReputationPenalty),
          }
        : p,
    ),
    alliances: clearBrokenAlliance(
      {
        ...state.alliances,
        pairs: state.alliances.pairs.filter((p) => !pairEquals(p, attackerOwnerId, targetOwnerId)),
      },
      attackerOwnerId,
      targetOwnerId,
    ),
  }
}

/**
 * A captured city changes hands with a wiped garrison, its build spent for the
 * round (so the captor can't also build with it this turn), and its stale
 * recruit pool cleared — next round replenishes it for the new owner's faction.
 * Shared by sea (#344) and land (#465) assaults so both capture identically.
 */
function cityCaptured(city: CityState, newOwnerId: string): CityState {
  const captured: CityState = {
    ...city,
    ownerId: newOwnerId,
    garrison: {},
    builtThisRound: true,
    unitAvailability: {},
  }
  // The old owner's garrisoned captain was captured with the city (#498).
  delete captured.garrisonCaptainId
  return captured
}

/**
 * Drop any garrison marker naming a captain in `capturedIds` (#498) — a
 * captive holds no post. The assaulted city itself is cleared by
 * {@link cityCaptured}; this catches the rare neighbour case where a captain
 * garrisoned at one city stood in port range of another that just fell.
 */
function clearGarrisonMarkers(cities: CityState[], capturedIds: ReadonlySet<string>): CityState[] {
  if (capturedIds.size === 0) return cities
  return cities.map((c) => {
    if (c.garrisonCaptainId === undefined || !capturedIds.has(c.garrisonCaptainId)) return c
    const next = { ...c }
    delete next.garrisonCaptainId
    return next
  })
}

/**
 * A successful defense keeps only recruited troops: militia and turrets (#435)
 * are free and never persist, and casualties are absorbed by the militia
 * first, so each surviving unit is clamped back to what the city actually
 * recruited. Without city-defense tuning this is a no-op (survivors can only
 * be ≤ the recruited count), preserving the pre-#435 behavior.
 */
function cityAfterDefense(city: CityState, defenderTroops: TroopStack[]): CityState {
  const survivors = new Map(defenderTroops.map((t) => [t.unitId, t.count]))
  const garrison: Record<string, number> = {}
  for (const [unitId, recruited] of Object.entries(city.garrison)) {
    const kept = Math.min(recruited, survivors.get(unitId) ?? 0)
    if (kept > 0) garrison[unitId] = kept
  }
  return { ...city, garrison }
}

// --- Landing parties (#465) ---------------------------------------------------

function ownedParty(state: GameState, partyId: string, action: Action): LandingParty {
  const party = state.parties.find((p) => p.id === partyId)
  if (!party || party.ownerId !== action.playerId) {
    throw new InvalidActionError(`No landing party ${partyId} owned by ${action.playerId}`, action)
  }
  return party
}

/**
 * A landing party as a board combatant (#465): troops only — no ship (zeroed
 * ship stats keep it out of the strength math, exactly like a city defender).
 * A captain-led party (#498) fights with its leader's combat bonuses
 * (skills + stats + items); pass the leader (see {@link partyLeader}) and the
 * catalog to apply them. Exported so the client can preview a land battle
 * against the same combatant the reducer resolves.
 */
export function partyToCombatant(
  party: LandingParty,
  leader?: Captain,
  content?: ContentCatalog,
): Combatant {
  const combatant: Combatant = {
    captainId: party.id,
    ownerId: party.ownerId,
    shipClassId: '',
    troops: party.troops,
    shipStats: { hull: 0, cannons: 0, speed: 0 },
  }
  if (leader && content) {
    const bonus = captainCombatBonus(leader, content)
    combatant.attackBonusPct = bonus.attackBonusPct
    combatant.defenseBonusPct = bonus.defenseBonusPct
    combatant.attackFlatBonus = bonus.attackFlatBonus
    combatant.defenseFlatBonus = bonus.defenseFlatBonus
  }
  return combatant
}

/**
 * Put a landing party ashore (#465): the captain detaches `troops` onto an
 * adjacent empty `land` tile for one movement point. The fresh party lands
 * with zero movement — it marches from the owner's next turn — so a single
 * turn can never sail, land, and strike inland in one breath.
 */
function disembark(state: GameState, action: DisembarkAction): GameState {
  const captain = ownedCaptain(state, action.captainId, action)
  requireShipControl(state, captain, action)
  if (captain.movementPoints < 1) {
    throw new InvalidActionError('Captain has no movement left to land a party', action)
  }
  const tile = tileAt(state.map, action.to)
  if (!tile) {
    throw new InvalidActionError(`Destination ${action.to.x},${action.to.y} is off-map`, action)
  }
  if (tile.type !== 'land') {
    throw new InvalidActionError('A landing party can only step ashore onto open land', action)
  }
  if (mapDistance(state.map, captain.position, action.to) !== 1) {
    throw new InvalidActionError('Landing tile is not adjacent to the ship', action)
  }
  if (state.parties.some((p) => coordsEqual(p.position, action.to))) {
    throw new InvalidActionError('Another party already holds the landing tile', action)
  }
  if (action.troops.length === 0) {
    throw new InvalidActionError('A landing party needs troops', action)
  }

  let aboard = captain.troops
  const landed: TroopStack[] = []
  for (const stack of action.troops) {
    if (!Number.isInteger(stack.count) || stack.count <= 0) {
      throw new InvalidActionError('Landing troop counts must be positive integers', action)
    }
    if (landed.some((t) => t.unitId === stack.unitId)) {
      throw new InvalidActionError(`Duplicate unit ${stack.unitId} in landing troops`, action)
    }
    const held = troopCount(aboard, stack.unitId)
    if (stack.count > held) {
      throw new InvalidActionError(`Only ${held} ${stack.unitId} aboard to land`, action)
    }
    aboard = adjustTroops(aboard, stack.unitId, -stack.count)
    landed.push({ unitId: stack.unitId, count: stack.count })
  }

  const player = state.players.find((p) => p.id === action.playerId)!
  const party: LandingParty = {
    id: `party-${state.actionCount}`,
    ownerId: action.playerId,
    name: `${player.name}'s Landing Party`,
    position: { ...action.to },
    movementPoints: 0,
    maxMovementPoints: state.config.setup.partyMovementPoints,
    troops: landed,
    // The captain goes ashore with the party (#498): it leads the column, and
    // its ship sits anchored — orderless and immobile — until reunited.
    ...(action.withCaptain ? { captainId: captain.id } : {}),
  }
  return {
    ...state,
    captains: state.captains.map((c) => {
      if (c.id !== captain.id) return c
      const next: Captain = { ...c, troops: aboard, movementPoints: c.movementPoints - 1 }
      if (action.withCaptain) {
        // An anchored ship holds no course and its captain marches with the
        // party, so the ship's remaining movement is spent (#498).
        next.movementPoints = 0
        delete next.sailOrder
      }
      return next
    }),
    parties: [...state.parties, party],
  }
}

/**
 * March a landing party overland (#465). The engine computes the shortest land
 * path deterministically — `land` tiles only, never through a tile any other
 * party holds — and validates it fits the party's remaining movement points.
 * Tiles marched over are revealed like a ship's wake (#295).
 */
function moveParty(state: GameState, action: MovePartyAction): GameState {
  const party = ownedParty(state, action.partyId, action)
  if (!tileAt(state.map, action.to)) {
    throw new InvalidActionError(`Destination ${action.to.x},${action.to.y} is off-map`, action)
  }

  const path = findLandPath(state.map, party.position, action.to, partyBlockedFor(state, party.id))
  if (!path) throw new InvalidActionError('Destination is not reachable overland', action)

  const cost = path.length - 1
  if (cost > party.movementPoints) {
    throw new InvalidActionError(
      `March costs ${cost} but party has ${party.movementPoints} movement`,
      action,
    )
  }

  const { captainVisionRadius } = state.config.setup
  const explored = new Set(state.exploredTiles[action.playerId] ?? [])
  for (const step of path) {
    for (const tile of tilesInRadius(step, captainVisionRadius, state.map)) {
      explored.add(tileKey(tile))
    }
  }

  return {
    ...state,
    parties: state.parties.map((p) =>
      p.id === party.id
        ? // A manual march overrides any standing march order (#482).
          withMarchOrder(
            { ...p, position: { ...action.to }, movementPoints: p.movementPoints - cost },
            undefined,
          )
        : p,
    ),
    captains: captainsFollowingParty(state.captains, party, action.to),
    exploredTiles: { ...state.exploredTiles, [action.playerId]: Array.from(explored) },
  }
}

/**
 * A shipless leading captain (#498) stands with its party, so its position
 * tracks the party's marches. A leader whose ship is still anchored stays at
 * the ship — that position IS the ship.
 */
function captainsFollowingParty(
  captains: Captain[],
  party: LandingParty,
  position: Coord,
): Captain[] {
  if (!party.captainId) return captains
  return captains.map((c) =>
    c.id === party.captainId && c.shipLost ? { ...c, position: { ...position } } : c,
  )
}

// --- Multi-turn march orders (#482) -------------------------------------------

/** Tile indices every party other than `partyId` holds — impassable to it, as in `moveParty`. */
function partyBlockedFor(state: GameState, partyId: string): Set<number> {
  return new Set(
    state.parties
      .filter((p) => p.id !== partyId)
      .map((p) => tileIndex(state.map, p.position.x, p.position.y)),
  )
}

/** Set or drop a party's march order, leaving no stray `undefined` key when dropped. */
function withMarchOrder(party: LandingParty, order: MarchOrder | undefined): LandingParty {
  if (order) return { ...party, marchOrder: order }
  if (party.marchOrder === undefined) return party
  const next = { ...party }
  delete next.marchOrder
  return next
}

function clearMarchOrderOn(state: GameState, partyId: string): GameState {
  return {
    ...state,
    parties: state.parties.map((p) => (p.id === partyId ? withMarchOrder(p, undefined) : p)),
  }
}

/**
 * Advance one party's standing march order (#482) as far as this turn's
 * movement allows — the overland twin of {@link advanceSailOrder}, sharing its
 * contract: re-path around the parties as they stand *now*, walk the route one
 * tile at a time (revealing as it goes), and stop the instant it arrives, runs
 * out of movement, or a NEW contact comes into view — pausing (`interrupted`)
 * in that last case. Unlike a sail order, a route with no current land path at
 * all (another party blocks every way through, or squats the destination)
 * also pauses rather than waiting silently: a marching column stopped in its
 * tracks is something the player should hear about. On arrival the order is
 * cleared. Pure — returns new state.
 *
 * Used both for the first leg at set-order time and for every turn-start
 * continuation, so both paths share one code path (and one replay contract).
 */
function advanceMarchOrder(state: GameState, partyId: string, playerId: string): GameState {
  const party = state.parties.find((p) => p.id === partyId)
  if (!party?.marchOrder) return state
  const order = party.marchOrder

  if (coordsEqual(party.position, order.destination)) {
    return clearMarchOrderOn(state, partyId)
  }

  const { captainVisionRadius } = state.config.setup
  const known = new Set(order.knownContactIds)
  const explored = new Set(state.exploredTiles[playerId] ?? [])

  let position = party.position
  let movementPoints = party.movementPoints
  // Pre-move: a new contact already in view at turn start pauses without a stray
  // step (an enemy that moved adjacent while this party held position).
  let contactsHere = currentContacts(state, playerId)
  let interrupted = contactsHere.some((id) => !known.has(id))
  let path: Coord[] | null = null
  if (!interrupted) {
    path = findLandPath(state.map, position, order.destination, partyBlockedFor(state, partyId))
    // No land route right now (blocked, or the destination is occupied): pause.
    if (!path) interrupted = true
  }

  if (!interrupted && path && path.length >= 2 && movementPoints > 0) {
    for (const coord of tilesInRadius(position, captainVisionRadius, state.map)) {
      explored.add(tileKey(coord))
    }
    // Walk one tile at a time so a new sighting stops the column AT the tile
    // it appeared.
    for (let i = 1; i < path.length && movementPoints > 0; i++) {
      position = path[i]!
      movementPoints -= 1
      for (const coord of tilesInRadius(position, captainVisionRadius, state.map)) {
        explored.add(tileKey(coord))
      }
      // Recompute from a state where only this party has advanced, so a
      // sighting this very step (own movement uncovering an enemy) counts.
      const scouted = withPartyProgress(state, partyId, position, explored, playerId)
      contactsHere = currentContacts(scouted, playerId)
      if (contactsHere.some((id) => !known.has(id))) {
        interrupted = true
        break
      }
      if (coordsEqual(position, order.destination)) break
    }
  }

  const arrived = !interrupted && coordsEqual(position, order.destination)
  const nextOrder: MarchOrder | undefined = arrived
    ? undefined
    : interrupted
      ? { ...order, knownContactIds: contactsHere, interrupted: true }
      : { ...order, knownContactIds: contactsHere }

  return {
    ...state,
    parties: state.parties.map((p) =>
      p.id === partyId ? withMarchOrder({ ...p, position, movementPoints }, nextOrder) : p,
    ),
    captains: captainsFollowingParty(state.captains, party, position),
    exploredTiles: { ...state.exploredTiles, [playerId]: Array.from(explored) },
  }
}

/** State with just `partyId` moved to `position` and `playerId`'s explored set updated — for the per-step contact scan. */
function withPartyProgress(
  state: GameState,
  partyId: string,
  position: Coord,
  explored: Set<string>,
  playerId: string,
): GameState {
  return {
    ...state,
    parties: state.parties.map((p) => (p.id === partyId ? { ...p, position } : p)),
    exploredTiles: { ...state.exploredTiles, [playerId]: Array.from(explored) },
  }
}

/**
 * Give a party a standing march order (#482) and immediately march this turn's
 * leg. `destination` must be a `land` tile reachable overland from where the
 * party stands, around the parties as they stand now.
 */
function setMarchOrder(state: GameState, action: SetMarchOrderAction): GameState {
  const party = ownedParty(state, action.partyId, action)
  const tile = tileAt(state.map, action.destination)
  if (!tile) {
    throw new InvalidActionError(
      `Destination ${action.destination.x},${action.destination.y} is off-map`,
      action,
    )
  }
  if (tile.type !== 'land') {
    throw new InvalidActionError('March destination is not open land', action)
  }
  if (coordsEqual(party.position, action.destination)) {
    throw new InvalidActionError('March destination is already the current tile', action)
  }
  if (
    !findLandPath(state.map, party.position, action.destination, partyBlockedFor(state, party.id))
  ) {
    throw new InvalidActionError('March destination is not reachable overland', action)
  }

  const order: MarchOrder = {
    destination: { ...action.destination },
    knownContactIds: currentContacts(state, action.playerId),
  }
  const withOrder: GameState = {
    ...state,
    parties: state.parties.map((p) => (p.id === party.id ? withMarchOrder(p, order) : p)),
  }
  return advanceMarchOrder(withOrder, party.id, action.playerId)
}

/** Cancel a party's standing march order (#482). Idempotent — valid with none set. */
function clearMarchOrder(state: GameState, action: ClearMarchOrderAction): GameState {
  ownedParty(state, action.partyId, action)
  return clearMarchOrderOn(state, action.partyId)
}

/**
 * At the start of `playerId`'s turn (after movement refresh), continue every one
 * of their parties' standing march orders (#482). A paused (interrupted) order
 * is skipped — it waits for the player to re-issue or clear it.
 */
function autoContinueMarchOrders(state: GameState, playerId: string): GameState {
  const ids = state.parties
    .filter((p) => p.ownerId === playerId && p.marchOrder && !p.marchOrder.interrupted)
    .map((p) => p.id)
  let working = state
  for (const id of ids) working = advanceMarchOrder(working, id, playerId)
  return working
}

/**
 * Re-board a landing party onto a friendly ship on an adjacent water tile
 * (#465) — the rescue half of the stranded-until-rescued rule (epic #469).
 * Loads as many troops as the ship's remaining crew capacity allows, in the
 * party's stack order: if everything fits the party leaves the map, otherwise
 * the remainder stays ashore as the same party. Costs no movement on either
 * piece — the ship's boats do the work.
 */
function embark(state: GameState, action: EmbarkAction): GameState {
  const party = ownedParty(state, action.partyId, action)
  const captain = ownedCaptain(state, action.captainId, action)
  // A captain-led party (#498) re-boards only its own captain's anchored ship —
  // the reunite that restores ship control. A leader does not abandon its
  // flagship for a berth on another hull, and a shipless leader has nothing to
  // re-board (see the deferral issue for stranded-captain rescue).
  if (party.captainId !== undefined && party.captainId !== captain.id) {
    throw new InvalidActionError(
      `${party.id} is led by ${party.captainId} and can only re-board that captain's ship`,
      action,
    )
  }
  if (party.captainId !== undefined && captain.shipLost) {
    throw new InvalidActionError(`${captain.id}'s ship was lost; there is nothing to re-board`, action) // prettier-ignore
  }
  if (mapDistance(state.map, party.position, captain.position) !== 1) {
    throw new InvalidActionError(`${captain.id} is not adjacent to the party`, action)
  }

  const shipDef = state.config.content?.ships[captain.shipClassId]
  const capacity = shipDef
    ? effectiveShipStats(shipDef, captain.shipUpgrades).crewCapacity
    : Infinity
  let room = capacity - captain.troops.reduce((sum, t) => sum + t.count, 0)
  if (room <= 0) {
    throw new InvalidActionError(`${captain.id}'s ship has no room to embark the party`, action)
  }

  let aboard = captain.troops
  const ashore: TroopStack[] = []
  for (const stack of party.troops) {
    const take = Math.min(stack.count, room)
    if (take > 0) {
      aboard = adjustTroops(aboard, stack.unitId, take)
      room -= take
    }
    if (take < stack.count) ashore.push({ unitId: stack.unitId, count: stack.count - take })
  }

  return {
    ...state,
    captains: state.captains.map((c) => (c.id === captain.id ? { ...c, troops: aboard } : c)),
    parties:
      ashore.length > 0
        ? state.parties.map((p) => {
            if (p.id !== party.id) return p
            const remainder: LandingParty = { ...p, troops: ashore }
            // The captain boards with whoever fits (#498): a partial reunite
            // leaves the remainder ashore as an ordinary, unled party.
            delete remainder.captainId
            return remainder
          })
        : state.parties.filter((p) => p.id !== party.id),
  }
}

/**
 * Attack an adjacent enemy landing party (#465): a land battle on the tactical
 * board, same combat math as a city assault's melee. Decisive by construction
 * (the board resolver always names a winner): the loser's party is destroyed
 * outright and the winner keeps its survivors. The attacker's movement is
 * spent whatever the outcome. Captain-led parties (#498) fight with their
 * leader's bonuses; a winning leader banks combat XP, and a destroyed party's
 * leader is captured by the winning seat.
 */
function attackParty(
  state: GameState,
  action: AttackPartyAction,
): { state: GameState; battleReport: BattleReport } {
  const attacker = ownedParty(state, action.partyId, action)
  if (attacker.movementPoints < 1) {
    throw new InvalidActionError('Party has no movement left to attack', action)
  }
  const target = state.parties.find((p) => p.id === action.targetPartyId)
  if (!target) throw new InvalidActionError(`No landing party ${action.targetPartyId}`, action)
  if (target.ownerId === action.playerId) {
    throw new InvalidActionError('Cannot attack your own party', action)
  }
  if (mapDistance(state.map, attacker.position, target.position) > 1) {
    throw new InvalidActionError('Target is not within attack range', action)
  }
  requireBoardTuning(state, action)
  for (const command of action.boardCommands ?? []) {
    if (!isValidBoardCommand(command)) {
      throw new InvalidActionError('Malformed board command in attacker plan', action)
    }
  }

  const stats = createCombatStats(state.config.combatStats!)
  const content = state.config.content
  const result = resolveBoardCombat(
    {
      attacker: partyToCombatant(attacker, partyLeader(state, attacker), content),
      defender: partyToCombatant(target, partyLeader(state, target), content),
    },
    stats,
    state.rngState,
    action.boardCommands?.length ? { attacker: boardPlanDriver(action.boardCommands) } : {},
    'land',
  )
  const { report } = result
  const attackerWon = report.attackerSurvived

  const parties = state.parties
    .filter((p) => p.id !== (attackerWon ? target.id : attacker.id))
    .map((p) => {
      if (attackerWon && p.id === attacker.id) {
        return { ...p, troops: result.attackerTroops, movementPoints: 0 }
      }
      if (!attackerWon && p.id === target.id) {
        return { ...p, troops: result.defenderTroops }
      }
      return p
    })

  // Captain-led parties (#498): the winning side's leader banks combat XP
  // (mirroring a decisive naval win); the destroyed side's leader is captured
  // by the winning seat, exactly like a lost ship duel.
  const winner = attackerWon ? attacker : target
  const loser = attackerWon ? target : attacker
  const combatWinXp = state.config.setup.combatWinXp
  const captivityReturnRound = state.round + state.config.setup.captainCaptivityRounds
  const captains = state.captains.map((c) => {
    if (winner.captainId === c.id) return { ...c, xp: c.xp + combatWinXp }
    if (loser.captainId === c.id) {
      return captureCaptain(c, winner.ownerId, captivityReturnRound)
    }
    return c
  })

  const { players, alliances } = betrayalAdjusted(state, attacker.ownerId, target.ownerId)
  const settled = settleEliminations({
    ...state,
    players,
    alliances,
    captains,
    parties,
    rngState: result.rng,
  })
  return { state: settled, battleReport: report }
}

/**
 * Assault an adjacent enemy city from the land side (#465). The party faces
 * the FULL city defense — recruited garrison plus automatic militia and
 * turrets, the same {@link cityToCombatant} defender a sea assault meets
 * (operator decision, epic #469). A win flips the city exactly like a sea
 * assault; a loss destroys the party — and captures its leading captain, if
 * one marched with it (#498).
 */
function partyAssaultCity(
  state: GameState,
  action: PartyAssaultCityAction,
): { state: GameState; battleReport: BattleReport } {
  const attacker = ownedParty(state, action.partyId, action)
  if (attacker.movementPoints < 1) {
    throw new InvalidActionError('Party has no movement left to assault', action)
  }
  const target = state.cities.find((c) => c.id === action.targetCityId)
  if (!target) throw new InvalidActionError(`No city ${action.targetCityId}`, action)
  if (target.ownerId === action.playerId) {
    throw new InvalidActionError('Cannot assault your own city', action)
  }
  if (mapDistance(state.map, attacker.position, target.position) > 1) {
    throw new InvalidActionError('City is not within assault range', action)
  }
  requireBoardTuning(state, action)
  for (const command of action.boardCommands ?? []) {
    if (!isValidBoardCommand(command)) {
      throw new InvalidActionError('Malformed board command in attacker plan', action)
    }
  }

  const stats = createCombatStats(state.config.combatStats!)
  const content = state.config.content
  const defenderFaction = state.players.find((p) => p.id === target.ownerId)?.faction
  // Port defense (#498) applies to a land assault exactly as to a sea one:
  // the harbor's ships join the defence, and all are captured if the city falls.
  const portDefenders = cityPortDefenders(state, target)
  const portDefenderIds = new Set(portDefenders.map((c) => c.id))
  const result = resolveBoardCombat(
    {
      attacker: partyToCombatant(attacker, partyLeader(state, attacker), content),
      defender: cityToCombatant(target, content, defenderFaction, portDefenders),
    },
    stats,
    state.rngState,
    action.boardCommands?.length ? { attacker: boardPlanDriver(action.boardCommands) } : {},
    'land',
  )
  const { report } = result
  const attackerWon = report.attackerSurvived

  const parties = attackerWon
    ? state.parties.map((p) =>
        p.id === attacker.id ? { ...p, troops: result.attackerTroops, movementPoints: 0 } : p,
      )
    : state.parties.filter((p) => p.id !== attacker.id)
  const cities = clearGarrisonMarkers(
    state.cities.map((c) => {
      if (c.id !== target.id) return c
      return attackerWon
        ? cityCaptured(c, attacker.ownerId)
        : cityAfterDefense(c, result.defenderTroops)
    }),
    attackerWon ? portDefenderIds : new Set(),
  )

  // Captain-led attacker (#498): a winning leader banks combat XP like a sea
  // assault's attacker; a destroyed party's leader is captured by the city's
  // owner. A fallen city's port defenders are all captured by the attacker.
  const combatWinXp = state.config.setup.combatWinXp
  const captivityReturnRound = state.round + state.config.setup.captainCaptivityRounds
  const captains = state.captains.map((c) => {
    if (attacker.captainId === c.id) {
      if (attackerWon) return { ...c, xp: c.xp + combatWinXp }
      return captureCaptain(c, target.ownerId, captivityReturnRound)
    }
    if (attackerWon && portDefenderIds.has(c.id)) {
      return captureCaptain(c, attacker.ownerId, captivityReturnRound)
    }
    return c
  })

  const { players, alliances } = betrayalAdjusted(state, attacker.ownerId, target.ownerId)
  const settled = settleEliminations({
    ...state,
    players,
    alliances,
    captains,
    parties,
    cities,
    rngState: result.rng,
  })
  return { state: settled, battleReport: report }
}

/** A land board battle needs combat stats with board tuning; fail loud without them. */
function requireBoardTuning(state: GameState, action: Action): void {
  if (!state.config.combatStats) {
    throw new InvalidActionError('No combat stats configured for this match', action)
  }
  if (!state.config.combatStats.battle) {
    throw new InvalidActionError('No board tuning configured — land battle is unavailable', action)
  }
}

const MAX_STANDING_ORDERS = 8

/** Structural check on an action-log board command: plain integers only. */
function isValidBoardCommand(command: BoardCommand): boolean {
  if (!Number.isInteger(command.stackId) || command.stackId < 0) return false
  if (command.to !== undefined) {
    if (!Number.isInteger(command.to.col) || !Number.isInteger(command.to.row)) return false
    if (command.to.col < 0 || command.to.row < 0) return false
  }
  if (command.targetId !== undefined) {
    if (!Number.isInteger(command.targetId) || command.targetId < 0) return false
  }
  return true
}

function setStandingOrders(state: GameState, action: SetStandingOrdersAction): GameState {
  const captain = state.captains.find((c) => c.id === action.captainId)
  if (!captain) throw new InvalidActionError(`No captain ${action.captainId}`, action)
  if (captain.ownerId !== action.playerId) {
    throw new InvalidActionError(`Captain ${action.captainId} is not yours`, action)
  }
  if (captain.captured) {
    throw new InvalidActionError(`Captain ${action.captainId} is captured and cannot act`, action)
  }
  if (action.orders.length > MAX_STANDING_ORDERS) {
    throw new InvalidActionError(`At most ${MAX_STANDING_ORDERS} standing orders`, action)
  }
  for (const order of action.orders) {
    if (!TACTICS.includes(order.tactic) || !ORDER_CONDITIONS.includes(order.when)) {
      throw new InvalidActionError(`Invalid standing order '${order.when}/${order.tactic}'`, action)
    }
  }
  if (action.boardOrders) {
    if (action.boardOrders.length > MAX_STANDING_ORDERS) {
      throw new InvalidActionError(`At most ${MAX_STANDING_ORDERS} board orders`, action)
    }
    for (const order of action.boardOrders) {
      if (
        !BOARD_DOCTRINES.includes(order.doctrine) ||
        !BOARD_ORDER_CONDITIONS.includes(order.when)
      ) {
        throw new InvalidActionError(
          `Invalid board order '${order.when}/${order.doctrine}'`,
          action,
        )
      }
    }
  }
  return {
    ...state,
    captains: state.captains.map((c) =>
      c.id === captain.id
        ? {
            ...c,
            standingOrders: action.orders.map((o) => ({ ...o })),
            // Absent = untouched; [] = cleared. Naval orders always replace.
            ...(action.boardOrders
              ? { boardOrders: action.boardOrders.map((o) => ({ ...o })) }
              : {}),
          }
        : c,
    ),
  }
}

function ownedCity(state: GameState, cityId: string, action: Action): CityState {
  const city = state.cities.find((c) => c.id === cityId)
  if (!city || city.ownerId !== action.playerId) {
    throw new InvalidActionError(`No city ${cityId} owned by ${action.playerId}`, action)
  }
  return city
}

function ownedCaptain(state: GameState, captainId: string, action: Action): Captain {
  const captain = state.captains.find((c) => c.id === captainId)
  if (!captain || captain.ownerId !== action.playerId) {
    throw new InvalidActionError(`No captain ${captainId} owned by ${action.playerId}`, action)
  }
  if (captain.captured) {
    throw new InvalidActionError(`Captain ${captainId} is captured and cannot act`, action)
  }
  return captain
}

/** The landing party this captain currently leads ashore (#498), if any. */
export function partyLedBy(state: GameState, captainId: string): LandingParty | undefined {
  return state.parties.find((p) => p.captainId === captainId)
}

/** The city this captain is garrisoning (#498), if any. */
export function garrisonCityOf(state: GameState, captainId: string): CityState | undefined {
  return state.cities.find((c) => c.garrisonCaptainId === captainId)
}

/** The captain leading a party ashore (#498), or undefined for an unled party. */
export function partyLeader(state: GameState, party: LandingParty): Captain | undefined {
  return party.captainId ? state.captains.find((c) => c.id === party.captainId) : undefined
}

/**
 * A ship-acting action needs a captain actually in command of a hull (#498):
 * not ashore leading a party (the ship sits anchored and orderless), not
 * shipless (the anchored hull was lost), and — unless the action makes sense
 * from a berth, like troop transfers and refits — not garrisoned in a city.
 */
function requireShipControl(
  state: GameState,
  captain: Captain,
  action: Action,
  opts: { allowGarrisoned?: boolean } = {},
): void {
  if (captain.shipLost) {
    throw new InvalidActionError(`${captain.id}'s ship was lost; the captain is ashore`, action)
  }
  if (partyLedBy(state, captain.id)) {
    throw new InvalidActionError(`${captain.id} is ashore leading a landing party`, action)
  }
  if (!opts.allowGarrisoned && garrisonCityOf(state, captain.id)) {
    throw new InvalidActionError(`${captain.id} is garrisoned and cannot act at sea`, action)
  }
}

/**
 * First water tile adjacent to `coord`, in the map's fixed neighbour order
 * (#308/#309) — used to place a freshly (re)recruited captain next to the
 * port it was hired at. Every city sits on a port tile, and mapgen
 * guarantees a home island's port always borders open water (map.ts), so
 * this never actually fails for a real city — but it takes `action` and
 * fails loud via `InvalidActionError`, like every other reducer rejection,
 * rather than a bare `Error` that would crash the caller instead of
 * bouncing cleanly.
 */
function adjacentWaterTile(map: GameMap, coord: Coord, action: Action): Coord {
  const water = mapNeighbors(map, coord).find((n) => isWaterTile(tileAt(map, n)))
  if (!water) {
    throw new InvalidActionError(`No water tile adjacent to ${coord.x},${coord.y}`, action)
  }
  return water
}

/**
 * Recruit a new captain at an owned port (#308), or rehire one of the owner's
 * own eligible captives from the recruitment pool (#309) — preserving its
 * name/XP/skills. Both paths go through this one action, so both require the
 * city to have a tavern (#433): rehiring is the same hiring transaction as a
 * fresh recruit, just against a different candidate pool. `ransomCaptain` is
 * a separate action (paying a captor, not hiring) and stays tavern-free.
 * Unlike the other content-gated actions (recruit, construct, upgradeShip),
 * this one has never required a content catalog to be configured — it only
 * uses one to assign starting crew — so the tavern check is skipped entirely
 * when no catalog is set, preserving that combat-only-match behavior.
 * Gold cost scales with how many live captains this seat already fields, so
 * recovering from zero always costs the base price while building a bigger
 * fleet gets steadily pricier.
 */
function recruitCaptain(state: GameState, action: RecruitCaptainAction): GameState {
  const city = ownedCity(state, action.cityId, action)
  const content = state.config.content
  if (content && !cityUnlocksCaptains(city, content)) {
    throw new InvalidActionError(`${city.id} has no tavern to recruit captains`, action)
  }
  const player = state.players.find((p) => p.id === action.playerId)!
  const setup = state.config.setup
  const liveCount = state.captains.filter(
    (c) => c.ownerId === action.playerId && !c.captured,
  ).length
  const cost = Math.ceil(setup.recruitCaptainBaseCost * setup.recruitCaptainCostGrowth ** liveCount)
  if (!canAfford(player.resources, { gold: cost })) {
    throw new InvalidActionError(`${action.playerId} cannot afford a new captain`, action)
  }

  const tierOneUnit = content
    ? Object.entries(content.units).find(
        ([, def]) => def.factionId === player.faction && def.tier === 1,
      )
    : undefined
  const crew: TroopStack[] = tierOneUnit
    ? [{ unitId: tierOneUnit[0], count: setup.recruitCaptainStartingCrew }]
    : []
  const spawnPosition = adjacentWaterTile(state.map, city.position, action)

  let captains: Captain[]
  if (action.captainId) {
    const captive = state.captains.find((c) => c.id === action.captainId)
    if (!captive || captive.ownerId !== action.playerId || !captive.captured) {
      throw new InvalidActionError(`${action.captainId} is not your captive to recruit`, action)
    }
    if (captive.captivityReturnRound === undefined || state.round < captive.captivityReturnRound) {
      throw new InvalidActionError(`${captive.id} is not yet eligible for recruitment`, action)
    }
    captains = state.captains.map((c) => {
      if (c.id !== captive.id) return c
      const revived: Captain = {
        ...c,
        captured: false,
        position: spawnPosition,
        // A rehired captive comes back on a starter hull (#374): its old ship
        // was handed to whoever captured it as a prize, so its upgrades go with
        // it — the returning captain buys refits afresh.
        shipClassId: setup.ransomReturnShipClassId ?? setup.startingShipClass,
        shipUpgrades: {},
        movementPoints: setup.startingCaptainMovement,
        maxMovementPoints: setup.startingCaptainMovement,
        troops: crew,
      }
      delete revived.capturedBy
      delete revived.captivityReturnRound
      return revived
    })
  } else {
    const newCaptain: Captain = {
      id: `cap-${action.playerId}-${state.actionCount}`,
      ownerId: action.playerId,
      name: `${player.name}'s Captain`,
      position: spawnPosition,
      shipClassId: setup.startingShipClass,
      movementPoints: setup.startingCaptainMovement,
      maxMovementPoints: setup.startingCaptainMovement,
      troops: crew,
      xp: 0,
      skills: [],
      stats: { attack: 0, defense: 0, speed: 0 },
      items: [],
      shipUpgrades: {},
      captured: false,
    }
    captains = [...state.captains, newCaptain]
  }

  return {
    ...state,
    players: state.players.map((p) =>
      p.id === action.playerId
        ? { ...p, resources: subtractResources(p.resources, { gold: cost }) }
        : p,
    ),
    captains,
  }
}

/**
 * Pay to free one of your own captured captains early (#309). A unilateral,
 * fixed gold price paid straight to the capturing seat: base cost plus a
 * per-XP scaling, so a veteran costs more to buy back. The captive becomes
 * immediately eligible for `recruitCaptain` — this action alone does not put
 * it back to sea.
 */
function ransomCaptain(state: GameState, action: RansomCaptainAction): GameState {
  const captive = state.captains.find((c) => c.id === action.captainId)
  if (!captive || captive.ownerId !== action.playerId) {
    throw new InvalidActionError(
      `No captain ${action.captainId} owned by ${action.playerId}`,
      action,
    )
  }
  if (!captive.captured || !captive.capturedBy) {
    throw new InvalidActionError(`${captive.id} is not held captive`, action)
  }
  const owner = state.players.find((p) => p.id === action.playerId)!
  const captor = state.players.find((p) => p.id === captive.capturedBy)
  if (!captor) {
    throw new InvalidActionError(`Captor ${captive.capturedBy} no longer exists`, action)
  }
  const setup = state.config.setup
  const cost = Math.ceil(setup.ransomBaseCost + captive.xp * setup.ransomXpMultiplier)
  if (!canAfford(owner.resources, { gold: cost })) {
    throw new InvalidActionError(`${action.playerId} cannot afford this ransom`, action)
  }

  return {
    ...state,
    players: state.players.map((p) => {
      if (p.id === owner.id)
        return { ...p, resources: subtractResources(p.resources, { gold: cost }) }
      if (p.id === captor.id) return { ...p, resources: addResources(p.resources, { gold: cost }) }
      return p
    }),
    captains: state.captains.map((c) =>
      c.id === captive.id ? { ...c, captivityReturnRound: state.round } : c,
    ),
  }
}

function construct(state: GameState, action: ConstructBuildingAction): GameState {
  const content = requireContent(state, action)
  const city = ownedCity(state, action.cityId, action)
  if (city.builtThisRound) {
    throw new InvalidActionError(`${city.id} has already built this turn`, action)
  }
  if (city.buildings.includes(action.buildingId)) {
    throw new InvalidActionError(`${city.id} already has ${action.buildingId}`, action)
  }
  const def = content.buildings[action.buildingId]
  if (!def) throw new InvalidActionError(`Unknown building ${action.buildingId}`, action)
  if (def.requires && !city.buildings.includes(def.requires)) {
    throw new InvalidActionError(`${action.buildingId} requires ${def.requires} first`, action)
  }
  // A shipyard needs a coastline (#467): an inland settlement — no port tile,
  // no adjacent water — can build the full tree except this. Data-flag-driven
  // (unlocksShipyard), never hardcoded to the 'shipyard' id.
  if (
    def.unlocksShipyard &&
    !mapNeighbors(state.map, city.position).some((n) => isWaterTile(tileAt(state.map, n)))
  ) {
    throw new InvalidActionError(`${action.buildingId} needs a coastline; ${city.id} is landlocked`, action) // prettier-ignore
  }
  const player = state.players.find((p) => p.id === action.playerId)!
  if (!canAfford(player.resources, def.cost)) {
    throw new InvalidActionError(`${action.playerId} cannot afford ${action.buildingId}`, action)
  }

  return {
    ...state,
    players: state.players.map((p) =>
      p.id === action.playerId ? { ...p, resources: subtractResources(p.resources, def.cost) } : p,
    ),
    cities: state.cities.map((c) =>
      c.id === city.id
        ? { ...c, buildings: [...c.buildings, action.buildingId], builtThisRound: true }
        : c,
    ),
  }
}

function recruit(state: GameState, action: RecruitUnitAction): GameState {
  const content = requireContent(state, action)
  if (action.count <= 0) throw new InvalidActionError('Recruit count must be positive', action)
  const city = ownedCity(state, action.cityId, action)
  const player = state.players.find((p) => p.id === action.playerId)!
  const def = content.units[action.unitId]
  if (!def || def.factionId !== player.faction) {
    throw new InvalidActionError(`${action.unitId} is not recruitable by ${player.faction}`, action)
  }
  if (def.tier > unlockedRecruitTier(city, content)) {
    throw new InvalidActionError(`${city.id} has not unlocked tier ${def.tier} recruits`, action)
  }
  const available = city.unitAvailability[action.unitId] ?? 0
  if (action.count > available) {
    throw new InvalidActionError(`Only ${available} ${action.unitId} available to recruit`, action)
  }
  const cost = { gold: def.goldCost * action.count }
  if (!canAfford(player.resources, cost)) {
    throw new InvalidActionError(
      `${action.playerId} cannot afford ${action.count} ${action.unitId}`,
      action,
    )
  }

  return {
    ...state,
    players: state.players.map((p) =>
      p.id === action.playerId ? { ...p, resources: subtractResources(p.resources, cost) } : p,
    ),
    cities: state.cities.map((c) =>
      c.id === city.id
        ? {
            ...c,
            unitAvailability: { ...c.unitAvailability, [action.unitId]: available - action.count },
            garrison: {
              ...c.garrison,
              [action.unitId]: (c.garrison[action.unitId] ?? 0) + action.count,
            },
          }
        : c,
    ),
  }
}

/**
 * Moves troops between a city's garrison and a captain docked at that city.
 * The captain must be adjacent to (or on) the city's port tile.
 */
function transferTroops(state: GameState, action: TransferTroopsAction): GameState {
  const content = requireContent(state, action)
  if (action.count <= 0) throw new InvalidActionError('Transfer count must be positive', action)
  const city = ownedCity(state, action.cityId, action)
  const captain = ownedCaptain(state, action.captainId, action)
  requireShipControl(state, captain, action, { allowGarrisoned: true })
  if (mapDistance(state.map, captain.position, city.position) > 1) {
    throw new InvalidActionError(`${captain.id} is not docked at ${city.id}`, action)
  }

  const garrisonCount = city.garrison[action.unitId] ?? 0
  const aboardCount = troopCount(captain.troops, action.unitId)

  if (action.direction === 'toShip') {
    if (action.count > garrisonCount) {
      throw new InvalidActionError(`${city.id} garrison has only ${garrisonCount} to send`, action)
    }
    const shipDef = content.ships[captain.shipClassId]
    const capacity = shipDef
      ? effectiveShipStats(shipDef, captain.shipUpgrades).crewCapacity
      : Infinity
    const currentAboard = captain.troops.reduce((sum, t) => sum + t.count, 0)
    if (currentAboard + action.count > capacity) {
      throw new InvalidActionError(
        `${captain.id}'s ship has no room for ${action.count} more`,
        action,
      )
    }
  } else if (action.count > aboardCount) {
    throw new InvalidActionError(`${captain.id} has only ${aboardCount} aboard to unload`, action)
  }

  const toShip = action.direction === 'toShip'
  return {
    ...state,
    cities: state.cities.map((c) =>
      c.id === city.id
        ? {
            ...c,
            garrison: {
              ...c.garrison,
              [action.unitId]: garrisonCount + (toShip ? -action.count : action.count),
            },
          }
        : c,
    ),
    captains: state.captains.map((cap) =>
      cap.id === captain.id
        ? {
            ...cap,
            troops: adjustTroops(cap.troops, action.unitId, toShip ? action.count : -action.count),
          }
        : cap,
    ),
  }
}

/** Grants a captain XP (#21) — from combat or, later, exploration. */
function gainCaptainXp(state: GameState, action: GainCaptainXpAction): GameState {
  if (action.amount <= 0) throw new InvalidActionError('XP amount must be positive', action)
  const captain = ownedCaptain(state, action.captainId, action)
  return {
    ...state,
    captains: state.captains.map((c) =>
      c.id === captain.id ? { ...c, xp: c.xp + action.amount } : c,
    ),
  }
}

/** Spends one of a captain's earned level-up skill picks (#21). */
function chooseCaptainSkill(state: GameState, action: ChooseCaptainSkillAction): GameState {
  const content = requireContent(state, action)
  const captain = ownedCaptain(state, action.captainId, action)
  const player = state.players.find((p) => p.id === action.playerId)!
  const skill = content.skills[action.skillId]
  if (!skill || skill.factionId !== player.faction) {
    throw new InvalidActionError(`${action.skillId} is not available to ${player.faction}`, action)
  }
  if (captain.skills.includes(action.skillId)) {
    throw new InvalidActionError(`${captain.id} already has ${action.skillId}`, action)
  }
  if (availableSkillPicks(captain, content.captainXpThresholds) < 1) {
    throw new InvalidActionError(`${captain.id} has no skill picks available`, action)
  }
  if (skill.tier > levelForXp(captain.xp, content.captainXpThresholds)) {
    throw new InvalidActionError(`${action.skillId} requires a higher level`, action)
  }
  return {
    ...state,
    captains: state.captains.map((c) =>
      c.id === captain.id ? { ...c, skills: [...c.skills, action.skillId] } : c,
    ),
  }
}

/** The three spendable captain stats (#498) — runtime validation for log data. */
const CAPTAIN_STATS: readonly string[] = ['attack', 'defense', 'speed']

/**
 * Spends one of a captain's earned level-up stat points (#498): one per level
 * above 1, in addition to the skill pick, with the pending count derived
 * (`level − 1 − pointsSpent`) rather than stored. Per-point effects are
 * content data (`ContentCatalog.captainStats`) — without that tuning there is
 * no stat system to spend into, so the action is rejected.
 */
function chooseCaptainStat(state: GameState, action: ChooseCaptainStatAction): GameState {
  const content = requireContent(state, action)
  if (!content.captainStats) {
    throw new InvalidActionError('No captain-stat tuning configured for this match', action)
  }
  if (!CAPTAIN_STATS.includes(action.stat)) {
    throw new InvalidActionError(`Unknown captain stat '${action.stat}'`, action)
  }
  const captain = ownedCaptain(state, action.captainId, action)
  if (availableStatPoints(captain, content.captainXpThresholds) < 1) {
    throw new InvalidActionError(`${captain.id} has no stat points available`, action)
  }
  return {
    ...state,
    captains: state.captains.map((c) =>
      c.id === captain.id
        ? { ...c, stats: { ...c.stats, [action.stat]: c.stats[action.stat] + 1 } }
        : c,
    ),
  }
}

/**
 * Station a docked captain in an owned city (#498). Garrisoning berths the
 * ship — remaining movement and any sail order are spent — and the captain is
 * immobile until released (`ungarrisonCaptain`); in exchange its ship and
 * combat bonuses join the city's defence, at the price of being captured with
 * the city if it falls.
 */
function garrisonCaptain(state: GameState, action: GarrisonCaptainAction): GameState {
  const city = ownedCity(state, action.cityId, action)
  const captain = ownedCaptain(state, action.captainId, action)
  requireShipControl(state, captain, action)
  if (mapDistance(state.map, captain.position, city.position) > 1) {
    throw new InvalidActionError(`${captain.id} is not docked at ${city.id}`, action)
  }
  if (city.garrisonCaptainId !== undefined) {
    throw new InvalidActionError(`${city.id} already has a garrisoned captain`, action)
  }
  return {
    ...state,
    cities: state.cities.map((c) =>
      c.id === city.id ? { ...c, garrisonCaptainId: captain.id } : c,
    ),
    captains: state.captains.map((c) =>
      c.id === captain.id ? withSailOrder({ ...c, movementPoints: 0 }, undefined) : c,
    ),
  }
}

/**
 * Release a city's garrisoned captain back to sea duty (#498). The ship stays
 * berthed for the rest of this turn (movement was spent standing down); it
 * refreshes normally from the owner's next turn.
 */
function ungarrisonCaptain(state: GameState, action: UngarrisonCaptainAction): GameState {
  const city = ownedCity(state, action.cityId, action)
  if (city.garrisonCaptainId === undefined) {
    throw new InvalidActionError(`${city.id} has no garrisoned captain`, action)
  }
  return {
    ...state,
    cities: state.cities.map((c) => {
      if (c.id !== city.id) return c
      const next = { ...c }
      delete next.garrisonCaptainId
      return next
    }),
  }
}

/** Shared validation for the stash-transfer actions (#498): item content, docked-at-own-city. */
function itemTransferContext(
  state: GameState,
  action: TakeItemAction | DepositItemAction,
): { captain: Captain; cap: number } {
  const content = requireContent(state, action)
  if (!content.items) {
    throw new InvalidActionError('No item content configured for this match', action)
  }
  const city = ownedCity(state, action.cityId, action)
  const captain = ownedCaptain(state, action.captainId, action)
  requireShipControl(state, captain, action, { allowGarrisoned: true })
  if (mapDistance(state.map, captain.position, city.position) > 1) {
    throw new InvalidActionError(`${captain.id} is not docked at ${city.id}`, action)
  }
  return { captain, cap: content.items.captainItemCap }
}

/** Move an item from the faction stash onto a docked captain (#498). */
function takeItem(state: GameState, action: TakeItemAction): GameState {
  const { captain, cap } = itemTransferContext(state, action)
  const player = state.players.find((p) => p.id === action.playerId)!
  const idx = player.itemStash.indexOf(action.itemId)
  if (idx === -1) {
    throw new InvalidActionError(`No ${action.itemId} in ${action.playerId}'s stash`, action)
  }
  if (captain.items.length >= cap) {
    throw new InvalidActionError(`${captain.id} already carries ${cap} items`, action)
  }
  return {
    ...state,
    players: state.players.map((p) =>
      p.id === player.id ? { ...p, itemStash: p.itemStash.filter((_, i) => i !== idx) } : p,
    ),
    captains: state.captains.map((c) =>
      c.id === captain.id ? { ...c, items: [...c.items, action.itemId] } : c,
    ),
  }
}

/** Move an item from a docked captain into the faction stash (#498). */
function depositItem(state: GameState, action: DepositItemAction): GameState {
  const { captain } = itemTransferContext(state, action)
  const idx = captain.items.indexOf(action.itemId)
  if (idx === -1) {
    throw new InvalidActionError(`${captain.id} does not carry ${action.itemId}`, action)
  }
  return {
    ...state,
    players: state.players.map((p) =>
      p.id === action.playerId ? { ...p, itemStash: [...p.itemStash, action.itemId] } : p,
    ),
    captains: state.captains.map((c) =>
      c.id === captain.id ? { ...c, items: c.items.filter((_, i) => i !== idx) } : c,
    ),
  }
}

/**
 * Bank a dropped item (#498): into the named captain's hold if it is under the
 * catalog's cap, else into the owning player's stash — the overflow rule. Pure
 * post-processing on an already-settled state.
 */
function applyItemGrant(
  state: GameState,
  playerId: string,
  captainId: string | undefined,
  itemId: string,
): GameState {
  const cap = state.config.content?.items?.captainItemCap ?? 0
  const captain = captainId ? state.captains.find((c) => c.id === captainId) : undefined
  if (captain && captain.items.length < cap) {
    return {
      ...state,
      captains: state.captains.map((c) =>
        c.id === captain.id ? { ...c, items: [...c.items, itemId] } : c,
      ),
    }
  }
  return {
    ...state,
    players: state.players.map((p) =>
      p.id === playerId ? { ...p, itemStash: [...p.itemStash, itemId] } : p,
    ),
  }
}

/** Buys the next level on one of a captain's ship's upgrade tracks (#22) at a city shipyard. */
function upgradeShip(state: GameState, action: UpgradeShipAction): GameState {
  const content = requireContent(state, action)
  const city = ownedCity(state, action.cityId, action)
  if (!city.buildings.includes('shipyard')) {
    throw new InvalidActionError(`${city.id} has no shipyard`, action)
  }
  const captain = ownedCaptain(state, action.captainId, action)
  requireShipControl(state, captain, action, { allowGarrisoned: true })
  if (mapDistance(state.map, captain.position, city.position) > 1) {
    throw new InvalidActionError(`${captain.id} is not docked at ${city.id}`, action)
  }
  const ship = content.ships[captain.shipClassId]
  if (!ship) throw new InvalidActionError(`Unknown ship class ${captain.shipClassId}`, action)
  const currentLevel = captain.shipUpgrades[action.track] ?? 0
  const cost = nextUpgradeCost(ship, action.track, currentLevel)
  if (cost === undefined) {
    throw new InvalidActionError(
      `${action.track} has no more levels for ${captain.shipClassId}`,
      action,
    )
  }
  const player = state.players.find((p) => p.id === action.playerId)!
  if (!canAfford(player.resources, { gold: cost })) {
    throw new InvalidActionError(`${action.playerId} cannot afford this upgrade`, action)
  }

  return {
    ...state,
    players: state.players.map((p) =>
      p.id === player.id ? { ...p, resources: subtractResources(p.resources, { gold: cost }) } : p,
    ),
    captains: state.captains.map((c) =>
      c.id === captain.id
        ? { ...c, shipUpgrades: { ...c.shipUpgrades, [action.track]: currentLevel + 1 } }
        : c,
    ),
  }
}

function resolveEncounter(
  state: GameState,
  action: ResolveEncounterAction,
): { state: GameState; outcome: EncounterOutcome } {
  const content = requireContent(state, action)
  if (!content.encounters) {
    throw new InvalidActionError('No encounter content configured for this match', action)
  }
  const captain = ownedCaptain(state, action.captainId, action)
  requireShipControl(state, captain, action)
  if (captain.movementPoints < 1) {
    throw new InvalidActionError('Captain has no movement left to engage', action)
  }
  const encounter = state.encounters.find((e) => e.id === action.encounterId)
  if (!encounter || !encounter.active) {
    throw new InvalidActionError(`No active encounter ${action.encounterId}`, action)
  }
  if (mapDistance(state.map, captain.position, encounter.position) > 1) {
    throw new InvalidActionError('Encounter is not within reach', action)
  }
  const kindDef = content.encounters[encounter.kind]
  const choiceDef = kindDef.choices[action.choice]
  if (!choiceDef) {
    throw new InvalidActionError(`'${action.choice}' is not a ${encounter.kind} choice`, action)
  }
  const player = state.players.find((p) => p.id === action.playerId)!
  const cost = choiceDef.cost ?? {}
  if (!canAfford(player.resources, cost)) {
    throw new InvalidActionError(`${action.playerId} cannot afford this encounter choice`, action)
  }

  const shipDef = content.ships[captain.shipClassId]
  const crewCapacity = shipDef
    ? effectiveShipStats(shipDef, captain.shipUpgrades).crewCapacity
    : Infinity
  const result = resolveEncounterChoice(
    choiceDef,
    player.faction,
    captain.troops,
    crewCapacity,
    state.rngState,
  )

  // Item drop (#498): a successful sea encounter may also yield an item,
  // rolled from the same RNG stream immediately after the outcome roll.
  let rng = result.rng
  let itemGained: string | undefined
  if (result.success && content.items) {
    const drop = rollItemDrop(content.items, content.items.seaEncounterDropChance, rng)
    rng = drop.rng
    if (drop.itemId) itemGained = drop.itemId
  }

  const respawnRound = kindDef.respawnDelay > 0 ? state.round + kindDef.respawnDelay : null
  const settled: GameState = {
    ...state,
    rngState: rng,
    players: state.players.map((p) =>
      p.id === player.id
        ? { ...p, resources: addResources(subtractResources(p.resources, cost), result.reward) }
        : p,
    ),
    captains: state.captains.map((c) =>
      c.id === captain.id
        ? { ...c, troops: result.troops, xp: c.xp + result.xpGained, movementPoints: 0 }
        : c,
    ),
    encounters: state.encounters.map((e) =>
      e.id === encounter.id ? { ...e, active: false, respawnRound } : e,
    ),
  }

  const outcome: EncounterOutcome = {
    encounterId: encounter.id,
    kind: encounter.kind,
    choice: action.choice,
    success: result.success,
    reward: result.reward,
    xpGained: result.xpGained,
    troopsLost: result.troopsLost,
  }
  if (result.troopsGained) outcome.troopsGained = result.troopsGained
  if (itemGained === undefined) return { state: settled, outcome }
  outcome.itemGained = itemGained
  return { state: applyItemGrant(settled, player.id, captain.id, itemGained), outcome }
}

/**
 * Capture a land resource site (#466) the party stands on. A **hold** site
 * (mine/sawmill) sets its persistent claim to this seat — it keeps paying each
 * round after the party marches off, and only flips when a rival party captures
 * it in turn. A **haul** site (lumber camp/ruin) pays its one-time reward and is
 * then spent. Either way it costs the party its remaining movement, so a party
 * takes at most one site per turn. A hold capture is deterministic; a haul
 * capture rolls the seeded item drop (#498) when the match carries item content.
 */
function captureSite(state: GameState, action: CaptureSiteAction): GameState {
  const content = requireContent(state, action)
  if (!content.landSites) {
    throw new InvalidActionError('No land-site content configured for this match', action)
  }
  const party = ownedParty(state, action.partyId, action)
  if (party.movementPoints < 1) {
    throw new InvalidActionError('Party has no movement left to capture a site', action)
  }
  const site = state.landSites.find((s) => s.id === action.siteId)
  if (!site || !site.active) {
    throw new InvalidActionError(`No active land site ${action.siteId}`, action)
  }
  if (!coordsEqual(party.position, site.position)) {
    throw new InvalidActionError('A party must stand on a site to capture it', action)
  }
  const def = content.landSites.sites[site.kind]
  if (!def) throw new InvalidActionError(`Unknown land site kind ${site.kind}`, action)

  const spentParties = state.parties.map((p) =>
    p.id === party.id ? { ...p, movementPoints: 0 } : p,
  )

  if (def.mode === 'hold') {
    if (site.claimedBy === action.playerId) {
      throw new InvalidActionError('This party already holds the site', action)
    }
    return {
      ...state,
      landSites: state.landSites.map((s) =>
        s.id === site.id ? { ...s, claimedBy: action.playerId } : s,
      ),
      parties: spentParties,
    }
  }

  // Haul: one-time payout into the treasury, then the site is spent for good.
  // A haul may also turn up an item (#498) — the find goes to the party's
  // leading captain if one marched with it, else to the faction stash.
  let rng = state.rngState
  let itemGained: string | undefined
  if (content.items) {
    const drop = rollItemDrop(content.items, content.items.landHaulDropChance, rng)
    rng = drop.rng
    if (drop.itemId) itemGained = drop.itemId
  }
  const settled: GameState = {
    ...state,
    rngState: rng,
    players: state.players.map((p) =>
      p.id === action.playerId ? { ...p, resources: addResources(p.resources, def.yield) } : p,
    ),
    landSites: state.landSites.map((s) => (s.id === site.id ? { ...s, active: false } : s)),
    parties: spentParties,
  }
  if (itemGained === undefined) return settled
  return applyItemGrant(settled, action.playerId, party.captainId, itemGained)
}

/**
 * Resolve a land random encounter (#466) with an adjacent landing party — the
 * overland twin of {@link resolveEncounter}, routed through the same seeded
 * {@link resolveEncounterChoice} roll but crediting the party's troops (there is
 * no ship crew-capacity cap ashore, so `grantCount` alone bounds a recruit).
 * A captain leading the party (#498) banks the encounter's XP and receives any
 * item find; an unled party earns no XP and finds go to the faction stash.
 * Spends the party's movement for the turn.
 */
function resolvePartyEncounter(
  state: GameState,
  action: ResolvePartyEncounterAction,
): { state: GameState; outcome: EncounterOutcome } {
  const content = requireContent(state, action)
  if (!content.landEncounters) {
    throw new InvalidActionError('No land-encounter content configured for this match', action)
  }
  const party = ownedParty(state, action.partyId, action)
  if (party.movementPoints < 1) {
    throw new InvalidActionError('Party has no movement left to engage', action)
  }
  const encounter = state.landEncounters.find((e) => e.id === action.encounterId)
  if (!encounter || !encounter.active) {
    throw new InvalidActionError(`No active land encounter ${action.encounterId}`, action)
  }
  if (mapDistance(state.map, party.position, encounter.position) > 1) {
    throw new InvalidActionError('Land encounter is not within reach', action)
  }
  const kindDef = content.landEncounters[encounter.kind]
  const choiceDef = kindDef.choices[action.choice]
  if (!choiceDef) {
    throw new InvalidActionError(`'${action.choice}' is not a ${encounter.kind} choice`, action)
  }
  const player = state.players.find((p) => p.id === action.playerId)!
  const cost = choiceDef.cost ?? {}
  if (!canAfford(player.resources, cost)) {
    throw new InvalidActionError(`${action.playerId} cannot afford this encounter choice`, action)
  }

  const result = resolveEncounterChoice(
    choiceDef,
    player.faction,
    party.troops,
    Infinity,
    state.rngState,
  )

  // Item drop (#498): a successful land encounter may also yield an item,
  // rolled from the same RNG stream immediately after the outcome roll.
  let rng = result.rng
  let itemGained: string | undefined
  if (result.success && content.items) {
    const drop = rollItemDrop(content.items, content.items.landEncounterDropChance, rng)
    rng = drop.rng
    if (drop.itemId) itemGained = drop.itemId
  }

  const respawnRound = kindDef.respawnDelay > 0 ? state.round + kindDef.respawnDelay : null
  const settled: GameState = {
    ...state,
    rngState: rng,
    players: state.players.map((p) =>
      p.id === player.id
        ? { ...p, resources: addResources(subtractResources(p.resources, cost), result.reward) }
        : p,
    ),
    // A leading captain (#498) banks the encounter XP, like a captain at sea.
    captains:
      party.captainId !== undefined && result.xpGained > 0
        ? state.captains.map((c) =>
            c.id === party.captainId ? { ...c, xp: c.xp + result.xpGained } : c,
          )
        : state.captains,
    parties: state.parties.map((p) =>
      p.id === party.id ? { ...p, troops: result.troops, movementPoints: 0 } : p,
    ),
    landEncounters: state.landEncounters.map((e) =>
      e.id === encounter.id ? { ...e, active: false, respawnRound } : e,
    ),
  }

  const outcome: EncounterOutcome = {
    encounterId: encounter.id,
    kind: encounter.kind,
    choice: action.choice,
    success: result.success,
    reward: result.reward,
    xpGained: party.captainId !== undefined ? result.xpGained : 0,
    troopsLost: result.troopsLost,
  }
  if (result.troopsGained) outcome.troopsGained = result.troopsGained
  if (itemGained === undefined) return { state: settled, outcome }
  outcome.itemGained = itemGained
  return { state: applyItemGrant(settled, player.id, party.captainId, itemGained), outcome }
}

/**
 * The reputation gate on forming NEW alliances (#138): a seat below
 * `setup.allianceReputationMin` can neither propose nor be allied with.
 * Checked at both propose and accept time (reputation can drop between the
 * two). Existing alliances are never dissolved by low reputation.
 */
function requireAllianceReputation(state: GameState, seatIds: string[], action: Action): void {
  const min = state.config.setup.allianceReputationMin
  for (const id of seatIds) {
    const player = state.players.find((p) => p.id === id)
    if (player && player.reputation < min) {
      throw new InvalidActionError(`${id}'s reputation is too low to form an alliance`, action)
    }
  }
}

/**
 * Step one of alliance consent (#136): record a pending proposal from the acting
 * seat to `targetId`. Turn-ordered — the caller is the current player by the
 * global guard in {@link applyActionWithOutcome}, so a seat can only propose on
 * its own turn.
 */
function proposeAlliance(state: GameState, action: ProposeAllianceAction): GameState {
  if (action.targetId === action.playerId) {
    throw new InvalidActionError('Cannot propose an alliance with yourself', action)
  }
  const target = state.players.find((p) => p.id === action.targetId)
  if (!target || target.eliminated) {
    throw new InvalidActionError(`No seat ${action.targetId} to ally with`, action)
  }
  const { pairs, proposals } = state.alliances
  if (pairsContain(pairs, action.playerId, action.targetId)) {
    throw new InvalidActionError(`Already allied with ${action.targetId}`, action)
  }
  if (proposalBetween(proposals, action.playerId, action.targetId)) {
    throw new InvalidActionError(`A proposal already stands with ${action.targetId}`, action)
  }
  requireAllianceReputation(state, [action.playerId, action.targetId], action)
  return {
    ...state,
    alliances: {
      ...state.alliances,
      proposals: [...proposals, { from: action.playerId, to: action.targetId }],
    },
  }
}

/**
 * Step two of alliance consent (#136): the acting seat accepts an offer that
 * `proposerId` made to it, forming the mutual alliance and clearing the
 * proposal. Rejected unless that exact proposal is pending — an accept with no
 * matching propose is never a valid state.
 */
function acceptAlliance(state: GameState, action: AcceptAllianceAction): GameState {
  const { pairs, proposals } = state.alliances
  const idx = proposals.findIndex((p) => p.from === action.proposerId && p.to === action.playerId)
  if (idx === -1) {
    throw new InvalidActionError(`No alliance proposal from ${action.proposerId} to accept`, action)
  }
  requireAllianceReputation(state, [action.playerId, action.proposerId], action)
  // Re-forming an alliance voids any lingering truce entry from a past break
  // (#177): you cannot be inside a truce window for an alliance you are back in.
  return {
    ...state,
    alliances: clearBrokenAlliance(
      {
        ...state.alliances,
        pairs: [...pairs, canonicalPair(action.playerId, action.proposerId)],
        proposals: proposals.filter((_, i) => i !== idx),
      },
      action.playerId,
      action.proposerId,
    ),
  }
}

/**
 * Break an existing alliance (#136). Unilateral: the acting seat dissolves its
 * pair with `otherId`; shared vision through the ex-ally drops on the next view
 * (#137). Rejected unless the two are currently allied. Opens the betrayal truce
 * window (#177): while it stands, attacking the ex-ally is still betrayal, so
 * leaving no longer buys a free same-turn backstab.
 */
function leaveAlliance(state: GameState, action: LeaveAllianceAction): GameState {
  const { pairs } = state.alliances
  if (!pairsContain(pairs, action.playerId, action.otherId)) {
    throw new InvalidActionError(`Not allied with ${action.otherId}`, action)
  }
  const dropped: AllianceState = {
    ...state.alliances,
    pairs: pairs.filter((p) => !pairEquals(p, action.playerId, action.otherId)),
  }
  const truceRounds = state.config.setup.betrayalTruceRounds ?? 0
  return {
    ...state,
    alliances:
      truceRounds > 0
        ? recordBrokenAlliance(dropped, action.playerId, action.otherId, state.round, truceRounds)
        : dropped,
  }
}

/**
 * The finished status for a match that is over, or `null` while play continues.
 * A match ends two ways (#426 added the second):
 *
 * - one seat (or none) left alive — last one standing wins;
 * - every living seat is AI in a match that ever had a human seat: with the
 *   last human resigned or eliminated there is nobody left to play for, so the
 *   match closes (no winner declared among the surviving AIs) instead of
 *   grinding on as an unwatched AI-vs-AI loop of battles. All-AI simulations
 *   (sim.ts) never had a human seat, so this clause never touches them.
 */
function matchResult(
  players: readonly PlayerState[],
): { status: 'finished'; winnerId: string | null } | null {
  const alive = players.filter((p) => !p.eliminated)
  if (alive.length <= 1) return { status: 'finished', winnerId: alive[0]?.id ?? null }
  if (alive.every((p) => p.isAI) && players.some((p) => !p.isAI)) {
    return { status: 'finished', winnerId: null }
  }
  return null
}

/**
 * Who wins a match that hits its round cap (#508): the living seat holding the
 * most cities; ties broken by gold treasury; still tied is a draw (`null`) —
 * never broken by seat order, so two even fleets share the result
 * deterministically. Eliminated seats' pieces were already swept off the board,
 * so only living seats can score.
 */
function roundLimitWinner(state: GameState): string | null {
  const alive = state.players.filter((p) => !p.eliminated)
  const scores = alive.map((p) => ({
    id: p.id,
    cities: state.cities.filter((c) => c.ownerId === p.id).length,
    gold: p.resources.gold,
  }))
  if (scores.length === 0) return null
  const maxCities = Math.max(...scores.map((s) => s.cities))
  const leaders = scores.filter((s) => s.cities === maxCities)
  if (leaders.length === 1) return leaders[0]!.id
  const maxGold = Math.max(...leaders.map((s) => s.gold))
  const richest = leaders.filter((s) => s.gold === maxGold)
  return richest.length === 1 ? richest[0]!.id : null
}

/**
 * After a battle: a player is eliminated only once they hold no live captain,
 * no city (#308), AND no landing party (#465) — a captured captain doesn't
 * count as "having a captain" (it can't act), but a city alone keeps a seat
 * alive even at zero live captains (the "rehire at the tavern while you hold
 * a town" recovery #308 enables), and a party ashore does too: a stranded
 * party can still march on a city and take it, so it is a live piece, not a
 * remnant. The game ends per {@link matchResult}, and if the acting player
 * was just eliminated the turn advances so play can continue.
 */
function settleEliminations(state: GameState): GameState {
  const players = state.players.map((p) =>
    !p.eliminated &&
    !state.captains.some((c) => c.ownerId === p.id && !c.captured) &&
    !state.cities.some((c) => c.ownerId === p.id) &&
    !state.parties.some((c) => c.ownerId === p.id)
      ? { ...p, eliminated: true }
      : p,
  )
  const eliminatedIds = new Set(players.filter((p) => p.eliminated).map((p) => p.id))
  const newlyEliminatedIds = state.players
    .filter((p) => !p.eliminated && eliminatedIds.has(p.id))
    .map((p) => p.id)

  // A newly-eliminated captor's captives return toward their owners'
  // recruitment pools immediately (#309), then every seat that just died
  // leaves its alliances and drops its proposals (#136), and its own
  // (now-dead) captains and cities come off the board with it (#208).
  let captains = state.captains.filter((c) => !eliminatedIds.has(c.ownerId))
  for (const captorId of newlyEliminatedIds) {
    captains = releaseCaptivesHeldBy(captains, captorId, state.round)
  }

  const withElims: GameState = {
    ...state,
    players,
    captains,
    cities: state.cities.filter((c) => !eliminatedIds.has(c.ownerId)),
    parties: state.parties.filter((p) => !eliminatedIds.has(p.ownerId)),
    alliances: pruneAlliancesForSeats(state.alliances, eliminatedIds),
  }

  const result = matchResult(withElims.players)
  if (result) {
    return { ...withElims, ...result }
  }
  if (withElims.players[withElims.currentPlayerIndex]!.eliminated) {
    return advanceTurn(withElims)
  }
  return withElims
}

function advanceTurn(state: GameState): GameState {
  const result = matchResult(state.players)
  if (result) {
    return { ...state, ...result }
  }

  let index = state.currentPlayerIndex
  let round = state.round
  do {
    index += 1
    if (index >= state.players.length) {
      index = 0
      round += 1
    }
  } while (state.players[index]!.eliminated)

  // Round cap (#508): the limit is the last round played. The check sits at
  // the same round boundary as income/replenish so a capped log replays to the
  // exact state it ended in live — the phantom round past the cap never starts,
  // collects no income, and moves no seat pointer.
  const roundLimit = state.config.setup.roundLimit
  if (roundLimit !== undefined && round > roundLimit) {
    return {
      ...state,
      status: 'finished',
      winnerId: roundLimitWinner(state),
      endedByRoundLimit: true,
    }
  }

  const roundAdvanced = round !== state.round
  const content = state.config.content

  // On a new round each surviving player collects income and every city refreshes
  // its build allowance and recruit pool (economy, #9/#10/#11).
  const players =
    roundAdvanced && content
      ? state.players.map((p) =>
          p.eliminated
            ? p
            : { ...p, resources: addResources(p.resources, difficultyIncome(state, p, content)) },
        )
      : state.players

  // Recruit pools top up on a cadence (#453): every `recruitReplenishInterval`
  // rounds, defaulting to 1 (every round, the pre-#453 behaviour). The pool is
  // seeded at round 1 by `createGame`, so the phase `(round - 1) % interval`
  // puts the next top-up exactly `interval` rounds later (round 6, 11, … at 5).
  // Slowing this is what stops the defender garrison from outgrowing any
  // crew-capacity-capped landing party. `builtThisRound` still resets every round.
  const replenishInterval = content?.recruitReplenishInterval ?? 1
  const replenishThisRound = roundAdvanced && (round - 1) % replenishInterval === 0
  const cities = roundAdvanced
    ? state.cities.map((c) => {
        const owner = state.players.find((p) => p.id === c.ownerId)
        return {
          ...c,
          builtThisRound: false,
          unitAvailability:
            content && owner && replenishThisRound
              ? replenishAvailability(c, owner.faction, content)
              : c.unitAvailability,
        }
      })
    : state.cities

  // Consumed encounters respawn once their delay elapses (#23) — sea and land
  // (#466) alike, on the same cadence.
  const encounters = roundAdvanced
    ? reactivateEncounters(state.encounters, round)
    : state.encounters
  const landEncounters = roundAdvanced
    ? reactivateEncounters(state.landEncounters, round)
    : state.landEncounters

  const newPlayerId = state.players[index]!.id
  // Refresh the incoming seat's movement, then auto-continue any standing sail
  // orders (#372) and march orders (#482) with the points they just regained.
  return autoContinueMarchOrders(
    autoContinueSailOrders(
      refreshMovement(
        { ...state, currentPlayerIndex: index, round, players, cities, encounters, landEncounters },
        newPlayerId,
      ),
      newPlayerId,
    ),
    newPlayerId,
  )
}

/**
 * A player's per-round income after their difficulty modifier (#25). `hard` AIs
 * may collect a bonus; `easy`/`normal` (and every human seat) take the raw income
 * unchanged — the no-resource-cheating guarantee. Floored to keep integer pools.
 */
function difficultyIncome(state: GameState, player: PlayerState, content: ContentCatalog) {
  const income = playerIncome(state, player.id, content)
  const table = state.config.aiDifficulties
  const mult = player.aiProfile && table ? table[player.aiProfile.difficulty].incomeMult : 1
  if (mult === 1) return income
  return {
    gold: Math.floor(income.gold * mult),
    timber: Math.floor(income.timber * mult),
    iron: Math.floor(income.iron * mult),
    rum: Math.floor(income.rum * mult),
  }
}

/**
 * Restore a player's captains and landing parties to full movement at the
 * start of their turn. A captain's allowance adds its speed bonus (#498: speed
 * stat points and item speed, rates from content). Captains with no ship to
 * sail — captured, garrisoned, ashore leading a party, or shipless — stay at
 * zero.
 */
function refreshMovement(state: GameState, playerId: string): GameState {
  const content = state.config.content
  const immobile = new Set<string>()
  for (const p of state.parties) if (p.captainId !== undefined) immobile.add(p.captainId)
  for (const c of state.cities) if (c.garrisonCaptainId !== undefined) immobile.add(c.garrisonCaptainId) // prettier-ignore
  return {
    ...state,
    captains: state.captains.map((c) => {
      if (c.ownerId !== playerId || c.captured || c.shipLost || immobile.has(c.id)) return c
      return { ...c, movementPoints: c.maxMovementPoints + captainSpeedBonus(c, content) }
    }),
    parties: state.parties.map((p) =>
      p.ownerId === playerId ? { ...p, movementPoints: p.maxMovementPoints } : p,
    ),
  }
}

/** Replay an action log against a fresh state — used for loads, replays, and audits. */
export function replay(initial: GameState, actions: readonly Action[]): GameState {
  return actions.reduce(applyAction, initial)
}
