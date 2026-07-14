/**
 * Every mutation of GameState is an Action applied through applyAction().
 * Actions are plain JSON (they get stored in the match_actions log verbatim).
 * New gameplay features are added by extending this union.
 */

import type { Coord } from '@aop/shared'
import type { BoardCommand, BoardOrder } from './battleBoard'
import type { EncounterChoice } from './content'
import type { StandingOrder, TacticId } from './tactics'
import type { CaptainStat, SailTargetKind, TroopStack } from './types'

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
 * Put a landing party ashore (#465): a captain on a water tile detaches
 * `troops` from its ship's hold onto the adjacent `land` tile `to`, creating a
 * new {@link LandingParty} piece there. Costs the captain one movement point;
 * the fresh party lands with zero movement (it marches from the owner's next
 * turn), so a single turn can never sail-land-strike in one breath. The tile
 * must be empty land — never water, a port (cities are assaulted, not walked
 * into), or a tile another party already holds.
 */
export interface DisembarkAction {
  type: 'disembark'
  playerId: string
  captainId: string
  /** The land tile the party steps ashore onto; must be adjacent to the ship. */
  to: Coord
  /** Troops to land, drawn from the ship's hold. Must be non-empty. */
  troops: TroopStack[]
  /**
   * Land the captain with the party (#498): the party fights with the
   * captain's combat bonuses, feeds it XP and land finds, and the ship stays
   * anchored — orderless and immobile — until the party re-boards it.
   */
  withCaptain?: boolean
}

/**
 * March a landing party overland (#465). The engine computes the shortest
 * land path deterministically — across `land` tiles only, never through a
 * tile any other party (friend or foe) holds — and validates it fits the
 * party's remaining movement points, so the log only needs the destination.
 * Enemy-held tiles are never entered: engaging an adjacent enemy party is the
 * explicit {@link AttackPartyAction}.
 */
export interface MovePartyAction {
  type: 'moveParty'
  playerId: string
  partyId: string
  to: Coord
}

/**
 * Re-board a landing party onto a friendly ship on an adjacent water tile
 * (#465) — the rescue half of the stranded-until-rescued rule (epic #469).
 * Loads as many troops as the ship's remaining crew capacity allows, in the
 * party's stack order (partial re-board): if everything fits the party piece
 * leaves the map, otherwise the remainder stays ashore as the same party.
 * Free of movement cost for both pieces — boarding is done by the ship's boats.
 */
export interface EmbarkAction {
  type: 'embark'
  playerId: string
  partyId: string
  captainId: string
}

/**
 * Attack an enemy landing party with your own (#465): an adjacent land battle
 * on the tactical board, same combat math as a city assault's melee. Decisive
 * by construction — the loser's party is destroyed outright (there is no
 * captain to capture ashore); the winner keeps its survivors and its movement
 * is spent. `boardCommands` mirrors {@link AttackCityAction.boardCommands}:
 * the attacker's recorded melee plan, or omitted for the board AI.
 */
export interface AttackPartyAction {
  type: 'attackParty'
  playerId: string
  partyId: string
  targetPartyId: string
  boardCommands?: BoardCommand[]
}

/**
 * Assault an adjacent enemy city from the land side (#465). Faces the FULL
 * city defense — recruited garrison plus automatic militia and turrets, the
 * exact same `cityToCombatant` defender a sea assault meets (operator
 * decision, epic #469: land is another approach vector, not a blind spot).
 * A decisive win flips the city's ownership exactly like a sea assault; a
 * loss destroys the party (no captain ashore to capture). `boardCommands` is
 * the attacker's recorded melee plan, as in {@link AttackCityAction}.
 */
export interface PartyAssaultCityAction {
  type: 'partyAssaultCity'
  playerId: string
  partyId: string
  targetCityId: string
  boardCommands?: BoardCommand[]
}

/**
 * Give a landing party a standing multi-turn march order (#482): march toward
 * `destination` (a fixed `land` tile — parties have no intercept orders),
 * auto-continuing at the start of each of the owner's turns until it arrives,
 * the route becomes impassable, or a new contact comes into view. Spends this
 * turn's movement immediately (the first leg), exactly as if the party had
 * been marched as far along the route as its points allow. Replaces any
 * existing order on the party, clearing a prior interrupt.
 */
export interface SetMarchOrderAction {
  type: 'setMarchOrder'
  playerId: string
  partyId: string
  destination: Coord
}

/** Cancel a party's standing march order (#482). No-op-safe: valid even if none is set. */
export interface ClearMarchOrderAction {
  type: 'clearMarchOrder'
  playerId: string
  partyId: string
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

/**
 * Spend a level-up stat point on a captain (#498) — one earned per level above
 * 1, in addition to the skill pick. Pending points are derived
 * (`level − 1 − pointsSpent`), so this is valid whenever that count is
 * positive. Per-point effects are content data (`ContentCatalog.captainStats`).
 */
export interface ChooseCaptainStatAction {
  type: 'chooseCaptainStat'
  playerId: string
  captainId: string
  stat: CaptainStat
}

/**
 * Station a docked captain in an owned city (#498). While garrisoned the
 * captain is immobile (no move/attack/disembark, and it is not a naval
 * target); in exchange its ship strength and combat bonuses join the city's
 * defence. If the city falls, the garrisoned captain is captured with it.
 */
export interface GarrisonCaptainAction {
  type: 'garrisonCaptain'
  playerId: string
  captainId: string
  cityId: string
}

/** Release a city's garrisoned captain back to sea duty (#498). */
export interface UngarrisonCaptainAction {
  type: 'ungarrisonCaptain'
  playerId: string
  cityId: string
}

/**
 * Move an item from the faction stash onto a captain docked at an owned city
 * (#498). Rejected when the captain already carries the catalog's cap.
 */
export interface TakeItemAction {
  type: 'takeItem'
  playerId: string
  captainId: string
  cityId: string
  itemId: string
}

/** Move an item from a docked captain into the faction stash (#498). */
export interface DepositItemAction {
  type: 'depositItem'
  playerId: string
  captainId: string
  cityId: string
  itemId: string
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
 * Capture a land resource site (#466) the party stands on. A **hold** site
 * (mine/sawmill) sets its persistent claim to this seat — it keeps paying each
 * round after the party marches off, and only changes hands when a rival party
 * captures it in turn. A **haul** site (lumber camp/ruin) pays its one-time
 * reward into the treasury and is then spent. Either way it costs the party its
 * remaining movement this turn, so a party can take at most one site per turn.
 */
export interface CaptureSiteAction {
  type: 'captureSite'
  playerId: string
  partyId: string
  siteId: string
}

/**
 * Resolve a land random encounter (#466) with an adjacent landing party — the
 * overland twin of {@link ResolveEncounterAction}, routed through the same
 * seeded choice/outcome roll but crediting the party (troops, not a ship's
 * crew, and no captain XP). Spends the party's movement for the turn.
 */
export interface ResolvePartyEncounterAction {
  type: 'resolvePartyEncounter'
  playerId: string
  partyId: string
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
  | DisembarkAction
  | MovePartyAction
  | EmbarkAction
  | AttackPartyAction
  | PartyAssaultCityAction
  | SetMarchOrderAction
  | ClearMarchOrderAction
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
  | ChooseCaptainStatAction
  | GarrisonCaptainAction
  | UngarrisonCaptainAction
  | TakeItemAction
  | DepositItemAction
  | UpgradeShipAction
  | ResolveEncounterAction
  | CaptureSiteAction
  | ResolvePartyEncounterAction
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
