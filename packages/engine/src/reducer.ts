import {
  addResources,
  canAfford,
  chebyshevDistance,
  subtractResources,
  type ResourcePool,
} from '@aop/shared'
import {
  InvalidActionError,
  type Action,
  type AttackCaptainAction,
  type ChooseCaptainSkillAction,
  type ConstructBuildingAction,
  type GainCaptainXpAction,
  type MoveCaptainAction,
  type RecruitUnitAction,
  type ResolveEncounterAction,
  type SetStandingOrdersAction,
  type TransferTroopsAction,
  type UpgradeShipAction,
} from './actions'
import {
  createCombatStats,
  effectiveShip,
  type BattleReport,
  type Combatant,
  type CombatResult,
} from './combat'
import type { ContentCatalog, EncounterKind } from './content'
import { playerIncome, replenishAvailability, unlockedRecruitTier } from './economy'
import { reactivateEncounters, resolveEncounterChoice } from './encounters'
import { currentPlayer } from './game'
import { tileAt } from './map'
import { findPath } from './pathfinding'
import { effectiveShipStats, nextUpgradeCost } from './ships'
import { availableSkillPicks, captainCombatBonus, levelForXp } from './skills'
import {
  aggressiveTacticDriver,
  aiTacticDriver,
  cautiousTacticDriver,
  ORDER_CONDITIONS,
  plainTacticDriver,
  resolveTacticalCombat,
  standingOrdersDriver,
  tacticPlanDriver,
  TACTICS,
  type TacticDriver,
} from './tactics'
import type { Captain, CityState, GameState, PlayerState, TroopStack } from './types'
import { accumulateExploredTiles } from './visibility'

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
    case 'setStandingOrders':
      next = setStandingOrders(state, action)
      break
    case 'construct':
      next = construct(state, action)
      break
    case 'recruit':
      next = recruit(state, action)
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

  return {
    ...state,
    captains: state.captains.map((c) =>
      c.id === captain.id
        ? { ...c, position: { ...action.to }, movementPoints: c.movementPoints - cost }
        : c,
    ),
  }
}

function eliminatePlayer(state: GameState, playerId: string): GameState {
  return {
    ...state,
    players: state.players.map((p) => (p.id === playerId ? { ...p, eliminated: true } : p)),
  }
}

/** Build a combatant, layering in this captain's ship upgrades (#22) and skill bonuses (#21). */
export function captainToCombatant(
  captain: Captain,
  faction: string,
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

/**
 * The combat AI driver a seat fights with when it has no player-supplied orders
 * (#25). Human seats and unprofiled AIs use the default; profiled AIs get a
 * personality-flavored driver, with `easy` deliberately playing the weak line.
 */
function aiTacticDriverForOwner(state: GameState, ownerId: string): TacticDriver {
  const profile = state.players.find((p) => p.id === ownerId)?.aiProfile
  if (!profile) return aiTacticDriver
  if (profile.difficulty === 'easy') return plainTacticDriver
  if (profile.personality === 'aggressive') return aggressiveTacticDriver
  if (profile.personality === 'economic') return cautiousTacticDriver
  return aiTacticDriver
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
  const target = state.captains.find((c) => c.id === action.targetCaptainId)
  if (!target) throw new InvalidActionError(`No captain ${action.targetCaptainId}`, action)
  if (target.ownerId === action.playerId) {
    throw new InvalidActionError('Cannot attack your own captain', action)
  }
  if (chebyshevDistance(attacker.position, target.position) > 1) {
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

  const stats = createCombatStats(state.config.combatStats)
  const content = state.config.content
  const attackerFaction = state.players.find((p) => p.id === attacker.ownerId)!.faction
  const defenderFaction = state.players.find((p) => p.id === target.ownerId)!.faction

  // The attacker plays its submitted plan; the defender fights by the standing
  // orders its own owner saved in state (never anything the attacker supplies).
  // Either side without orders is driven by the combat AI — auto-resolve.
  const result: CombatResult = resolveTacticalCombat(
    {
      attacker: captainToCombatant(attacker, attackerFaction, content),
      defender: captainToCombatant(target, defenderFaction, content),
    },
    stats,
    state.rngState,
    {
      attacker: action.attackerOrders?.length
        ? tacticPlanDriver(action.attackerOrders)
        : aiTacticDriverForOwner(state, attacker.ownerId),
      defender: target.standingOrders?.length
        ? standingOrdersDriver(target.standingOrders, stats.tactics.outgunnedRatio)
        : aiTacticDriverForOwner(state, target.ownerId),
    },
  )
  const { report } = result
  const winnerCaptainId = report.winnerId === attacker.ownerId ? attacker.id : target.id
  const combatWinXp = state.config.setup.combatWinXp

  // Write back survivors: sink defeated captains, update troops, award the winner
  // combat XP (#21), and spend the attacker's movement for the turn.
  const captains = state.captains
    .filter((c) => {
      if (c.id === attacker.id) return report.attackerSurvived
      if (c.id === target.id) return report.defenderSurvived
      return true
    })
    .map((c) => {
      const wonXp = c.id === winnerCaptainId ? combatWinXp : 0
      if (c.id === attacker.id) {
        return { ...c, troops: result.attackerTroops, movementPoints: 0, xp: c.xp + wonXp }
      }
      if (c.id === target.id) return { ...c, troops: result.defenderTroops, xp: c.xp + wonXp }
      return c
    })

  const settled = settleEliminations({ ...state, captains, rngState: result.rng })
  return { state: settled, battleReport: report }
}

const MAX_STANDING_ORDERS = 8

function setStandingOrders(state: GameState, action: SetStandingOrdersAction): GameState {
  const captain = state.captains.find((c) => c.id === action.captainId)
  if (!captain) throw new InvalidActionError(`No captain ${action.captainId}`, action)
  if (captain.ownerId !== action.playerId) {
    throw new InvalidActionError(`Captain ${action.captainId} is not yours`, action)
  }
  if (action.orders.length > MAX_STANDING_ORDERS) {
    throw new InvalidActionError(`At most ${MAX_STANDING_ORDERS} standing orders`, action)
  }
  for (const order of action.orders) {
    if (!TACTICS.includes(order.tactic) || !ORDER_CONDITIONS.includes(order.when)) {
      throw new InvalidActionError(`Invalid standing order '${order.when}/${order.tactic}'`, action)
    }
  }
  return {
    ...state,
    captains: state.captains.map((c) =>
      c.id === captain.id ? { ...c, standingOrders: action.orders.map((o) => ({ ...o })) } : c,
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
  return captain
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
  if (chebyshevDistance(captain.position, city.position) > 1) {
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
  if (chebyshevDistance(captain.position, city.position) > 1) {
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
  if (chebyshevDistance(captain.position, encounter.position) > 1) {
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
 * After a battle: any player with no captains left is eliminated, the game ends
 * if one (or none) remains, and if the acting player was just eliminated the turn
 * advances so play can continue.
 */
function settleEliminations(state: GameState): GameState {
  const withElims: GameState = {
    ...state,
    players: state.players.map((p) =>
      !p.eliminated && !state.captains.some((c) => c.ownerId === p.id)
        ? { ...p, eliminated: true }
        : p,
    ),
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

  return refreshMovement(
    { ...state, currentPlayerIndex: index, round, players, cities, encounters },
    state.players[index]!.id,
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
