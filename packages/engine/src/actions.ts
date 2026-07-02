/**
 * Every mutation of GameState is an Action applied through applyAction().
 * Actions are plain JSON (they get stored in the match_actions log verbatim).
 * New gameplay features are added by extending this union.
 */

import type { Coord } from '@aop/shared'
import type { StandingOrder, TacticId } from './tactics'

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
 * ship is sunk.
 *
 * `attackerOrders` is the attacker's own per-round tactic plan (an interactive
 * player's recorded picks, or a preset pattern); omitted means the combat AI
 * drives the attacker — auto-resolve, same math. The defender's tactics are
 * deliberately NOT part of this action: they come from the target captain's
 * standing orders in GameState (set by its owner via `setStandingOrders`), or
 * the combat AI when none are set. An attacker who could submit the defender's
 * orders could puppet the defence — an anti-cheat hole under the D-009
 * server-authoritative model.
 */
export interface AttackCaptainAction {
  type: 'attackCaptain'
  playerId: string
  captainId: string
  targetCaptainId: string
  attackerOrders?: TacticId[]
}

/**
 * Set (or clear, with an empty array) a captain's standing orders: the
 * conditional defence plan used whenever this captain is attacked — the Phase 3
 * offline-defence mechanism (D-002), e.g. "evade if outgunned, else broadside".
 */
export interface SetStandingOrdersAction {
  type: 'setStandingOrders'
  playerId: string
  captainId: string
  orders: StandingOrder[]
}

export type Action =
  EndTurnAction | ResignAction | MoveCaptainAction | AttackCaptainAction | SetStandingOrdersAction

export class InvalidActionError extends Error {
  constructor(
    message: string,
    readonly action: Action,
  ) {
    super(message)
    this.name = 'InvalidActionError'
  }
}
