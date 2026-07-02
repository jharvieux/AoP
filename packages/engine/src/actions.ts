/**
 * Every mutation of GameState is an Action applied through applyAction().
 * Actions are plain JSON (they get stored in the match_actions log verbatim).
 * New gameplay features are added by extending this union.
 */

import type { Coord } from '@aop/shared'
import type { TacticId } from './tactics'

export interface EndTurnAction {
  type: 'endTurn'
  playerId: string
}

export interface ResignAction {
  type: 'resign'
  playerId: string
}

/**
 * Sail a captain to a destination water tile. The engine computes the shortest
 * water path deterministically and validates it fits the captain's remaining
 * movement points, so the log only needs the destination.
 */
export interface MoveCaptainAction {
  type: 'moveCaptain'
  playerId: string
  captainId: string
  to: Coord
}

/**
 * Attack an enemy captain within one tile. Resolves the hybrid tactical combat
 * pipeline, writes back casualties, and eliminates any captain (and player) whose
 * ship is sunk. Optional per-side standing tactic orders drive the battle; when
 * omitted, that side is auto-resolved by the combat AI.
 */
export interface AttackCaptainAction {
  type: 'attackCaptain'
  playerId: string
  captainId: string
  targetCaptainId: string
  attackerOrders?: TacticId[]
  defenderOrders?: TacticId[]
}

export type Action = EndTurnAction | ResignAction | MoveCaptainAction | AttackCaptainAction

export class InvalidActionError extends Error {
  constructor(
    message: string,
    readonly action: Action,
  ) {
    super(message)
    this.name = 'InvalidActionError'
  }
}
