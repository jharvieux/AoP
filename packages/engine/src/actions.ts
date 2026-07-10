/**
 * Every mutation of GameState is an Action applied through applyAction().
 * Actions are plain JSON (they get stored in the match_actions log verbatim).
 * New gameplay features are added by extending this union.
 */

import type { Coord } from '@aop/shared'
import type { BoardCommand, BoardOrder } from './battleBoard'
import type { EncounterChoice } from './content'
import type { StandingOrder, TacticId } from './tactics'
import type { SailTargetKind } from './types'

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
 * drives the attacker — auto-resolve, same math. The defender's tactics come
 * from the target captain's standing orders in GameState (set by its owner via
 * `setStandingOrders`), or the combat AI when none are set — EXCEPT when the
 * server itself authors `defenderOrders`/`defenderBoardCommands` below.
 *
 * An attacker who could submit the defender's orders could puppet the defence —
 * an anti-cheat hole under the D-009 server-authoritative model. `defenderOrders`
 * / `defenderBoardCommands` are therefore **server-authored only**: the
 * `battle-session` resolver populates them from the defender's OWN authenticated
 * `battle-round` submissions (docs/design/multiplayer-tactical-probe.md §10,
 * D-029). The client `submit-action` path must reject them
 * (`assertClientSubmittable`, enforced in #408) so an attacker can never puppet
 * the defence; `sanitizeAction` allows them structurally so the server-authored
 * resolve action round-trips through `appendAction`.
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
  /**
   * The interactive defender's recorded per-round tactic picks (#418, #410,
   * D-029). **Server-authored only** (see the interface doc). When present, the
   * defender plays these picks for the rounds it recorded, and its standing
   * orders → AI finish any tail rounds it never answered (asymmetric
   * force-resolution, D-029 §10.5 — a genuinely different tail from the
   * attacker's cyclic wrap). Omitted means today's behavior exactly: the
   * defender fights by the target captain's standing orders (or the combat AI).
   * Never serialized from a client action and never surfaced in a `PlayerView`.
   */
  defenderOrders?: TacticId[]
  /**
   * The interactive defender's recorded battle-board commands (#418, #410).
   * **Server-authored only**, mirroring {@link defenderOrders} for the melee
   * phase: the defender plays these commands, then its board doctrine → board AI
   * finishes the tail. Omitted means the defender's melee comes from the target
   * captain's own board orders (or the board AI), exactly as today.
   */
  defenderBoardCommands?: BoardCommand[]
}

/**
 * Assault an adjacent enemy city (#344), pitting the attacker's embarked troops
 * against the city's garrison on the tactical board's land entry point. A
 * captain must be within one tile of the target city (its ship sits off the
 * port) and carry troops. On a decisive attacker win the city changes hands —
 * the seat that loses its last city (with no live captain) is eliminated, which
 * is what finally makes conquest victory reachable. On a loss the attacking
 * captain is captured by the defending seat, exactly like a lost ship duel.
 *
 * `boardCommands` is the attacker's recorded per-activation melee plan, mirroring
 * {@link AttackCaptainAction.boardCommands}: an interactive client simulates the
 * land board locally and records the player's commands here; omitted means the
 * board AI fights the assault (auto-resolve). The defender's garrison never
 * fights by anything the attacker submits — a city has no owner-supplied board
 * orders, so its garrison is always driven by the board AI.
 */
export interface AttackCityAction {
  type: 'attackCity'
  playerId: string
  captainId: string
  targetCityId: string
  boardCommands?: BoardCommand[]
}

/**
 * Give a captain a standing multi-turn sail order (#372): sail toward
 * `destination` (or intercept the entity named by `targetId`/`targetKind`),
 * auto-continuing at the start of each of the owner's turns until it arrives,
 * runs out of navigable water, or a new contact comes into view. Spends this
 * turn's movement immediately (the first leg), exactly as if the captain had
 * been ordered as far along the route as its points allow. Replaces any
 * existing order on the captain, clearing a prior interrupt.
 */
export interface SetSailOrderAction {
  type: 'setSailOrder'
  playerId: string
  captainId: string
  destination: Coord
  /** Intercept this entity instead of a fixed tile; requires {@link targetKind}. */
  targetId?: string
  targetKind?: SailTargetKind
}

/** Cancel a captain's standing sail order (#372). No-op-safe: valid even if none is set. */
export interface ClearSailOrderAction {
  type: 'clearSailOrder'
  playerId: string
  captainId: string
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

/**
 * Recruit a new captain (#308/#309) at an owned port city — gold cost, scaled
 * by how many live captains this seat already fields, buys a starting ship
 * and a small crew. Omit `captainId` to mint a brand-new captain; supply the
 * id of one of your own captive captains — past its `captivityReturnRound`
 * — to rehire it instead, preserving its name/XP/skills.
 */
export interface RecruitCaptainAction {
  type: 'recruitCaptain'
  playerId: string
  cityId: string
  captainId?: string
}

/**
 * Pay to free one of your own captured captains early (#309). A unilateral,
 * fixed gold price paid straight to the capturing seat — no offer/accept
 * round-trip. The captive becomes immediately eligible for `recruitCaptain`
 * (still at the normal gold cost); ransom itself does not put it back to sea.
 */
export interface RansomCaptainAction {
  type: 'ransomCaptain'
  playerId: string
  captainId: string
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
  | AttackCityAction
  | SetSailOrderAction
  | ClearSailOrderAction
  | SetStandingOrdersAction
  | ConstructBuildingAction
  | RecruitUnitAction
  | RecruitCaptainAction
  | RansomCaptainAction
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
