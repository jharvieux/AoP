import type { StandingOrder } from './standingOrders'

/**
 * Every mutation of GameState is an Action applied through applyAction().
 * Actions are plain JSON (they get stored in the match_actions log verbatim).
 * New gameplay features are added by extending this union.
 */

export interface EndTurnAction {
  type: 'endTurn'
  playerId: string
}

export interface ResignAction {
  type: 'resign'
  playerId: string
}

/** Construct a building in one of the player's cities. HoMM-style: one build per city per turn. */
export interface ConstructBuildingAction {
  type: 'construct'
  playerId: string
  cityId: string
  buildingId: string
}

/** Recruit `count` of a unit into a city's garrison, spending gold and available recruits. */
export interface RecruitUnitAction {
  type: 'recruit'
  playerId: string
  cityId: string
  unitId: string
  count: number
}

/** Move troops between a city's garrison and a visiting captain's ship hold. */
export interface TransferTroopsAction {
  type: 'transferTroops'
  playerId: string
  cityId: string
  captainId: string
  direction: 'toShip' | 'toGarrison'
  unitId: string
  count: number
}

/** Set the defensive policy for a city's garrison or a captain's fleet. */
export interface SetStandingOrderAction {
  type: 'setStandingOrder'
  playerId: string
  targetType: 'city' | 'captain'
  targetId: string
  order: StandingOrder
}

/** Grant XP to a captain (#21) — from combat (drilling) or, later, exploration. */
export interface GainCaptainXpAction {
  type: 'gainCaptainXp'
  playerId: string
  captainId: string
  amount: number
}

/** Spend a level-up skill pick on a captain (#21). */
export interface ChooseCaptainSkillAction {
  type: 'chooseCaptainSkill'
  playerId: string
  captainId: string
  skillId: string
}

/** Buy the next level on one of a captain's ship's upgrade tracks (#22) at a city shipyard. */
export interface UpgradeShipAction {
  type: 'upgradeShip'
  playerId: string
  cityId: string
  captainId: string
  track: string
}

export type Action =
  | EndTurnAction
  | ResignAction
  | ConstructBuildingAction
  | RecruitUnitAction
  | TransferTroopsAction
  | SetStandingOrderAction
  | GainCaptainXpAction
  | ChooseCaptainSkillAction
  | UpgradeShipAction

export class InvalidActionError extends Error {
  constructor(
    message: string,
    readonly action: Action,
  ) {
    super(message)
    this.name = 'InvalidActionError'
  }
}
