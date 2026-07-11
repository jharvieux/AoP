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
  type ChooseCaptainSkillAction,
  type ClearSailOrderAction,
  type ConstructBuildingAction,
  type GainCaptainXpAction,
  type LeaveAllianceAction,
  type MoveCaptainAction,
  type ProposeAllianceAction,
  type RansomCaptainAction,
  type RecruitCaptainAction,
  type RecruitUnitAction,
  type ResolveEncounterAction,
  type SetSailOrderAction,
  type SetStandingOrdersAction,
  type TransferTroopsAction,
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
import type { ContentCatalog, EncounterKind } from './content'
import { playerIncome, replenishAvailability, unlockedRecruitTier } from './economy'
import { reactivateEncounters, resolveEncounterChoice } from './encounters'
import { areAllied, currentPlayer } from './game'
import { isWaterTile, mapDistance, mapNeighbors, tileAt, tileIndex, type GameMap } from './map'
import { findPath, pathCost } from './pathfinding'
import { RULES_VERSION, RulesVersionMismatchError } from './rulesVersion'
import { effectiveShipStats, nextUpgradeCost } from './ships'
import { availableSkillPicks, captainCombatBonus, levelForXp } from './skills'
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
  kind: EncounterKind
  choice: string
  success: boolean
  reward: Partial<ResourcePool>
  xpGained: number
  troopsGained?: TroopStack
  troopsLost: TroopStack[]
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
    case 'setSailOrder':
      next = setSailOrder(state, action)
      break
    case 'clearSailOrder':
      next = clearSailOrder(state, action)
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
    case 'upgradeShip':
      next = upgradeShip(state, action)
      break
    case 'resolveEncounter': {
      const result = resolveEncounter(state, action)
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
  return captured
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
 *   derives from the highest-tier available unit (see `turretUnitId`). Appended
 *   last so the board's per-side stack cap sheds turrets before recruited troops.
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
  for (const [unitId, def] of Object.entries(content.units)) {
    if (def.factionId === roster && def.tier <= tier) {
      counts.set(unitId, (counts.get(unitId) ?? 0) + cd.militiaPerType)
    }
  }
  const troops = [...counts.entries()]
    .filter(([, count]) => count > 0)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([unitId, count]) => ({ unitId, count }))

  const turretId = turretUnitId(roster, tier)
  for (let i = 0; i < cd.turretCount; i++) troops.push({ unitId: turretId, count: 1 })
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
 */
export function cityToCombatant(
  city: CityState,
  content: ContentCatalog | undefined,
  factionId?: string,
): Combatant {
  const combatant: Combatant = {
    captainId: city.id,
    ownerId: city.ownerId,
    shipClassId: '',
    troops: cityDefenderTroops(city, content, factionId),
    shipStats: { hull: 0, cannons: 0, speed: 0 },
  }
  if (content) {
    const bonus = city.buildings.reduce(
      (sum, b) => sum + (content.buildings[b]?.defenseBonus ?? 0),
      0,
    )
    if (bonus > 0) combatant.defenseBonusPct = bonus
  }
  return combatant
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
  const target = state.captains.find((c) => c.id === action.targetCaptainId)
  if (!target) throw new InvalidActionError(`No captain ${action.targetCaptainId}`, action)
  if (target.ownerId === action.playerId) {
    throw new InvalidActionError('Cannot attack your own captain', action)
  }
  if (target.captured) {
    throw new InvalidActionError(`Captain ${action.targetCaptainId} is already captured`, action)
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

  // Betrayal (#138, #177): attacking an ally is legal — no leave step required —
  // but the alliance dissolves and the attacker pays the reputation price, in
  // the same action as the battle itself (never an intermediate state where an
  // ally was attacked and the alliance stands). It is equally a betrayal to
  // strike an ex-ally still inside the truce window (#177): leaving first no
  // longer buys a free same-turn backstab — only waiting out the window does.
  const truceRounds = state.config.setup.betrayalTruceRounds ?? 0
  const betrayal =
    areAllied(state, attacker.ownerId, target.ownerId) ||
    wasAllyWithinTruce(state.alliances, attacker.ownerId, target.ownerId, state.round, truceRounds)

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
      attacker: captainToCombatant(attacker, content),
      defender: captainToCombatant(target, content),
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

  const players = betrayal
    ? state.players.map((p) =>
        p.id === attacker.ownerId
          ? {
              ...p,
              reputation: Math.max(0, p.reputation - state.config.setup.betrayalReputationPenalty),
            }
          : p,
      )
    : state.players
  // On a betrayal, drop any live pair (the current-ally case) and clear the
  // truce entry (the ex-ally case) so the same window can't be billed twice.
  const alliances = betrayal
    ? clearBrokenAlliance(
        {
          ...state.alliances,
          pairs: state.alliances.pairs.filter(
            (p) => !pairEquals(p, attacker.ownerId, target.ownerId),
          ),
        },
        attacker.ownerId,
        target.ownerId,
      )
    : state.alliances

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

  // Betrayal (#138/#177): assaulting an ally's city breaks the alliance and
  // costs reputation in the same action as the battle, keyed on the city's
  // owner — the same rule as a ship duel against an ally (attackCaptain).
  const truceRounds = state.config.setup.betrayalTruceRounds ?? 0
  const betrayal =
    areAllied(state, attacker.ownerId, target.ownerId) ||
    wasAllyWithinTruce(state.alliances, attacker.ownerId, target.ownerId, state.round, truceRounds)

  const stats = createCombatStats(state.config.combatStats)
  const content = state.config.content

  // The attacker plays its recorded land-melee plan, or its saved board doctrine,
  // or the board AI — the same fallback chain as a boarding melee (#39/#93). The
  // garrison has no owner-supplied board orders, so it is always the board AI.
  const defenderFaction = state.players.find((p) => p.id === target.ownerId)?.faction
  const result = resolveBoardCombat(
    {
      attacker: captainToCombatant(attacker, content),
      defender: cityToCombatant(target, content, defenderFaction),
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
    if (c.id !== attacker.id) return c
    if (attackerWon) {
      return { ...c, troops: result.attackerTroops, movementPoints: 0, xp: c.xp + combatWinXp }
    }
    return captureCaptain(c, target.ownerId, captivityReturnRound)
  })

  const cities = state.cities.map((c) => {
    if (c.id !== target.id) return c
    if (attackerWon) {
      // The city changes hands with a wiped garrison, its build spent for the
      // round (so the captor can't also build with it this turn), and its stale
      // recruit pool cleared — next round replenishes it for the new owner's
      // faction.
      return {
        ...c,
        ownerId: attacker.ownerId,
        garrison: {},
        builtThisRound: true,
        unitAvailability: {},
      }
    }
    // A successful defense keeps only recruited troops: militia and turrets
    // (#435) are free and never persist, and casualties are absorbed by the
    // militia first, so each surviving unit is clamped back to what the city
    // actually recruited. Without city-defense tuning this is a no-op (survivors
    // can only be ≤ the recruited count), preserving the pre-#435 behavior.
    const survivors = new Map(result.defenderTroops.map((t) => [t.unitId, t.count]))
    const garrison: Record<string, number> = {}
    for (const [unitId, recruited] of Object.entries(c.garrison)) {
      const kept = Math.min(recruited, survivors.get(unitId) ?? 0)
      if (kept > 0) garrison[unitId] = kept
    }
    return { ...c, garrison }
  })

  const players = betrayal
    ? state.players.map((p) =>
        p.id === attacker.ownerId
          ? {
              ...p,
              reputation: Math.max(0, p.reputation - state.config.setup.betrayalReputationPenalty),
            }
          : p,
      )
    : state.players
  const alliances = betrayal
    ? clearBrokenAlliance(
        {
          ...state.alliances,
          pairs: state.alliances.pairs.filter(
            (p) => !pairEquals(p, attacker.ownerId, target.ownerId),
          ),
        },
        attacker.ownerId,
        target.ownerId,
      )
    : state.alliances

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
 * name/XP/skills. Gold cost scales with how many live captains this seat
 * already fields, so recovering from zero always costs the base price while
 * building a bigger fleet gets steadily pricier.
 */
function recruitCaptain(state: GameState, action: RecruitCaptainAction): GameState {
  const city = ownedCity(state, action.cityId, action)
  const player = state.players.find((p) => p.id === action.playerId)!
  const setup = state.config.setup
  const liveCount = state.captains.filter(
    (c) => c.ownerId === action.playerId && !c.captured,
  ).length
  const cost = Math.ceil(setup.recruitCaptainBaseCost * setup.recruitCaptainCostGrowth ** liveCount)
  if (!canAfford(player.resources, { gold: cost })) {
    throw new InvalidActionError(`${action.playerId} cannot afford a new captain`, action)
  }

  const content = state.config.content
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

/** Buys the next level on one of a captain's ship's upgrade tracks (#22) at a city shipyard. */
function upgradeShip(state: GameState, action: UpgradeShipAction): GameState {
  const content = requireContent(state, action)
  const city = ownedCity(state, action.cityId, action)
  if (!city.buildings.includes('shipyard')) {
    throw new InvalidActionError(`${city.id} has no shipyard`, action)
  }
  const captain = ownedCaptain(state, action.captainId, action)
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

  const respawnRound = kindDef.respawnDelay > 0 ? state.round + kindDef.respawnDelay : null
  const settled: GameState = {
    ...state,
    rngState: result.rng,
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
  return { state: settled, outcome }
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
 * After a battle: a player is eliminated only once they hold no live captain
 * AND no city (#308) — a captured captain doesn't count as "having a
 * captain" (it can't act), but a city alone keeps a seat alive even at zero
 * live captains, exactly the "rehire at the tavern while you hold a town"
 * recovery #308 was written to enable. The game ends if one (or none)
 * remains, and if the acting player was just eliminated the turn advances so
 * play can continue.
 */
function settleEliminations(state: GameState): GameState {
  const players = state.players.map((p) =>
    !p.eliminated &&
    !state.captains.some((c) => c.ownerId === p.id && !c.captured) &&
    !state.cities.some((c) => c.ownerId === p.id)
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
    alliances: pruneAlliancesForSeats(state.alliances, eliminatedIds),
  }

  const alive = withElims.players.filter((p) => !p.eliminated)
  if (alive.length <= 1) {
    return { ...withElims, status: 'finished', winnerId: alive[0]?.id ?? null }
  }
  if (withElims.players[withElims.currentPlayerIndex]!.eliminated) {
    return advanceTurn(withElims)
  }
  return withElims
}

function advanceTurn(state: GameState): GameState {
  const alive = state.players.filter((p) => !p.eliminated)
  if (alive.length <= 1) {
    return { ...state, status: 'finished', winnerId: alive[0]?.id ?? null }
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

  const cities = roundAdvanced
    ? state.cities.map((c) => {
        const owner = state.players.find((p) => p.id === c.ownerId)
        return {
          ...c,
          builtThisRound: false,
          unitAvailability:
            content && owner
              ? replenishAvailability(c, owner.faction, content)
              : c.unitAvailability,
        }
      })
    : state.cities

  // Consumed encounters respawn once their delay elapses (#23).
  const encounters = roundAdvanced
    ? reactivateEncounters(state.encounters, round)
    : state.encounters

  const newPlayerId = state.players[index]!.id
  // Refresh the incoming seat's movement, then auto-continue any standing sail
  // orders (#372) with the points they just regained.
  return autoContinueSailOrders(
    refreshMovement(
      { ...state, currentPlayerIndex: index, round, players, cities, encounters },
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

/** Restore a player's captains to full movement at the start of their turn. */
function refreshMovement(state: GameState, playerId: string): GameState {
  return {
    ...state,
    captains: state.captains.map((c) =>
      c.ownerId === playerId ? { ...c, movementPoints: c.maxMovementPoints } : c,
    ),
  }
}

/** Replay an action log against a fresh state — used for loads, replays, and audits. */
export function replay(initial: GameState, actions: readonly Action[]): GameState {
  return actions.reduce(applyAction, initial)
}
