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

export type Action = EndTurnAction | ResignAction

export class InvalidActionError extends Error {
  constructor(
    message: string,
    readonly action: Action,
  ) {
    super(message)
    this.name = 'InvalidActionError'
  }
}
