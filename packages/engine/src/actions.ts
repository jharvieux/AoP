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

export type Action =
  EndTurnAction | ResignAction | ConstructBuildingAction | RecruitUnitAction | TransferTroopsAction

export class InvalidActionError extends Error {
  constructor(
    message: string,
    readonly action: Action,
  ) {
    super(message)
    this.name = 'InvalidActionError'
  }
}
