/**
 * Every mutation of GameState is an Action applied through applyAction().
 * Actions are plain JSON (they get stored in the match_actions log verbatim).
 * New gameplay features are added by extending this union.
 */

import type { Coord } from '@aop/shared'
import type { BoardCommand, BoardOrder } from './battleBoard'
import type { EncounterChoice } from './content'
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
  /**
   * The attacker's recorded battle-board commands (#39), one per activation of
   * the attacker's stacks, used if the battle goes to a boarding melee. An
   * interactive client simulates the board locally (the engine's board step is
   * pure), records the player's commands here, and the server re-derives the
   * identical fight from the log. Omitted means the board AI fights the melee.
   * Like `attackerOrders`, the defender's side is never accepted from the
   * attacker — it comes from the target captain's own board orders in state.
   */
  boardCommands?: BoardCommand[]
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
  /**
   * Conditional board doctrine (#39) used when this captain's crew is dragged
   * into a boarding melee while its owner is offline — the board analog of the
   * naval `orders`. Omitted leaves the captain's board orders untouched; an
   * empty array clears them (back to the board AI).
   */
  boardOrders?: BoardOrder[]
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

/** Grant XP to a captain (#21) — from combat or, later, exploration. */
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

/**
 * Interact with an adjacent random encounter (#23). `choice` must be one the
 * encounter's kind offers (merchant: trade/rob; natives: trade/fight/quest;
 * settlers: recruit/escort/raid); the outcome resolves from the seeded RNG.
 */
export interface ResolveEncounterAction {
  type: 'resolveEncounter'
  playerId: string
  captainId: string
  encounterId: string
  choice: EncounterChoice
}

/**
 * Offer an alliance to another seat (#136). Step one of the turn-ordered
 * two-step consent: `playerId` proposes on their own turn; the offer stands as a
 * pending {@link AllianceProposal} until `targetId` accepts (on their turn) via
 * {@link AcceptAllianceAction}. Rejected if the seats are already allied, a
 * proposal already stands between them (in either direction), or `targetId` is
 * absent, self, or eliminated.
 */
export interface ProposeAllianceAction {
  type: 'proposeAlliance'
  playerId: string
  targetId: string
}

/**
 * Accept a standing alliance proposal (#136). Step two of consent: `playerId`
 * accepts on their own turn an offer that `proposerId` made to them, forming a
 * mutual alliance. Rejected unless a proposal from `proposerId` to `playerId`
 * is actually pending — an accept with no matching proposal is never valid.
 */
export interface AcceptAllianceAction {
  type: 'acceptAlliance'
  playerId: string
  proposerId: string
}

/**
 * Break an existing alliance (#136). `playerId` unilaterally dissolves the
 * alliance with `otherId` on their own turn; shared vision through the ex-ally
 * drops instantly (#137). Rejected unless the two are currently allied.
 */
export interface LeaveAllianceAction {
  type: 'leaveAlliance'
  playerId: string
  otherId: string
}

export type Action =
  | EndTurnAction
  | ResignAction
  | MoveCaptainAction
  | AttackCaptainAction
  | SetStandingOrdersAction
  | ConstructBuildingAction
  | RecruitUnitAction
  | TransferTroopsAction
  | GainCaptainXpAction
  | ChooseCaptainSkillAction
  | UpgradeShipAction
  | ResolveEncounterAction
  | ProposeAllianceAction
  | AcceptAllianceAction
  | LeaveAllianceAction

export class InvalidActionError extends Error {
  constructor(
    message: string,
    readonly action: Action,
  ) {
    super(message)
    this.name = 'InvalidActionError'
  }
}
