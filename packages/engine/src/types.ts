import type { Coord, FactionId, MapSize, ResourcePool } from '@aop/shared'
import type { AiDifficultyModifier, AiPersonalityWeights, AiTuning } from './ai'
import type { CombatStatsData } from './combat'
import type {
  ContentCatalog,
  EncounterKind,
  LandEncounterKind,
  LandSiteKind,
  ResourceNodeKind,
} from './content'
import type { GameMap, GridTopology } from './map'
import type { MapDefinition } from './mapDefinition'
import type { BoardOrder } from './battleBoard'
import type { RngState } from './rng'
import type { StandingOrder } from './tactics'

/** A homogeneous group of troops aboard a captain's ship. `unitId` indexes @aop/content. */
export interface TroopStack {
  unitId: string
  count: number
}

/** The three AI archetypes (#25); each biases the utility-scoring weights differently. */
export type AiPersonality = 'aggressive' | 'economic' | 'opportunist'

/** AI skill tiers (#25). `easy` blunders, `normal` plays competently, `hard` plays optimally. */
export type AiDifficulty = 'easy' | 'normal' | 'hard'

/**
 * An AI seat's behavior selection (#25). `personality` picks which weight overlay
 * shapes its decisions; `difficulty` scales its skill (see {@link AiDifficultyModifier}).
 * Set per-player at match creation and mirrored into {@link PlayerState}.
 */
export interface AiProfile {
  personality: AiPersonality
  difficulty: AiDifficulty
}

export interface PlayerConfig {
  id: string
  name: string
  faction: FactionId
  isAI: boolean
  /**
   * Optional starting troops for this player's captain. Populated by the caller
   * from @aop/content so the engine stays free of any content dependency.
   */
  startingTroops?: TroopStack[]
  /** AI behavior selection (#25). Ignored for human seats; drives {@link nextAiAction} for AI ones. */
  aiProfile?: AiProfile
  /**
   * Starting-alliance seed (#136). Players sharing a non-null team begin the
   * match mutually allied — `createGame` folds every same-team pair into the
   * initial {@link AllianceState}, which is the source of truth from then on
   * (the propose/accept/leave actions mutate it; this field is never re-read
   * after game start). Absent = this seat begins allied with no one.
   */
  team?: string
}

/** What a {@link SailOrder} is chasing, so continuation re-aims at a live target. */
export type SailTargetKind = 'captain' | 'city' | 'encounter'

/**
 * A standing multi-turn sail order (#372). A captain given a destination beyond
 * its remaining movement keeps sailing toward it at the start of each of its
 * owner's turns until it arrives, runs out of water, or a *new* contact comes
 * into view (fog-of-war interrupt) — at which point it pauses (`interrupted`)
 * and waits for the player instead of blundering blind into a fresh enemy.
 *
 * Plain JSON so it serializes and replays with the rest of GameState. Absent on
 * a captain with no standing order (never `undefined`-valued) — so pre-#372
 * saves and every idle captain are byte-identical.
 */
export interface SailOrder {
  /** The tile being sailed to. For a target order, its position at set time (informational — continuation re-reads the live target). */
  destination: Coord
  /** The entity being intercepted, if this order chases one rather than a fixed tile. */
  targetId?: string
  /** Which of the id spaces {@link targetId} lives in; required whenever `targetId` is set. */
  targetKind?: SailTargetKind
  /**
   * Contacts (enemy captains/cities/encounters) the owner had already sighted
   * when the leg began — the baseline against which a *new* sighting is
   * detected. Refreshed each turn the order advances without interruption, so
   * an already-known contact never re-triggers the pause. Sorted, from
   * {@link currentContacts}.
   */
  knownContactIds: string[]
  /**
   * True once the order paused because a new contact appeared. A paused order
   * stays put (does not auto-advance) until the player re-issues or clears it.
   * Omitted while the order is still actively sailing.
   */
  interrupted?: boolean
}

/** The three trainable captain attributes (#498), one point earned per level above 1. */
export type CaptainStat = 'attack' | 'defense' | 'speed'

/**
 * Points spent per captain attribute (#498). Pending points are derived —
 * `level − 1 − (attack + defense + speed)` — so no pending-choice state exists.
 * Attack/defense points add FLAT per-unit attack/defense to every unit under
 * the captain, before the skills' percentage scaling (per-point amounts in
 * `ContentCatalog.captainStats`); speed adds movement at refresh. Carried
 * items boost these stats (see skills.ts `effectiveCaptainStats`).
 */
export interface CaptainStats {
  attack: number
  defense: number
  speed: number
}

/**
 * A captain — the hero analog. Sails a flagship over water, carries troops, and
 * fights ship-to-ship. Lives in GameState as plain data.
 */
export interface Captain {
  id: string
  ownerId: string
  name: string
  position: Coord
  /** Flagship class id (indexes @aop/content SHIP_CLASSES). */
  shipClassId: string
  /** Movement points remaining this turn (one point = one water step). */
  movementPoints: number
  /** Movement points granted at the start of each of the owner's turns. */
  maxMovementPoints: number
  troops: TroopStack[]
  /**
   * Conditional defence plan used when this captain is attacked (Phase 3:
   * while its owner is offline). Hidden information — Phase 3 view filtering
   * must strip this from enemy-facing views, like rngState (D-009).
   */
  standingOrders?: StandingOrder[]
  /**
   * Conditional melee doctrine for the tactical battle board (#39), used when
   * this captain's crew is boarded while its owner is offline. Hidden
   * information, stripped from enemy-facing views exactly like standingOrders.
   */
  boardOrders?: BoardOrder[]
  /** Cumulative combat/exploration XP (#21). Level is derived from this via skills.ts. */
  xp: number
  /** Skill ids chosen at level-up, in pick order. At most one per level above 1. */
  skills: string[]
  /** Stat points spent at level-up (#498), one earned per level above 1 in addition to the skill pick. */
  stats: CaptainStats
  /**
   * Item ids held (#498), in acquisition order; duplicates allowed. Every held
   * item is passively active. Capped by the catalog's `captainItemCap` — finds
   * beyond the cap overflow to the owner's {@link PlayerState.itemStash}.
   */
  items: string[]
  /** Purchased level (0 = stock) per upgrade track at a city shipyard (#22). Missing key = 0. */
  shipUpgrades: Record<string, number>
  /**
   * True while this captain is held captive by another seat (#309) after
   * losing a decisive battle, instead of being removed from play outright. A
   * captured captain cannot move, attack, or take any other action — its
   * owner must either wait out `captivityReturnRound` or pay
   * `ransomCaptain`, then spend a `recruitCaptain` action to bring it back
   * into active service. Public information in player views, unlike XP,
   * skills, or troops (#309).
   */
  captured: boolean
  /**
   * The seat currently holding this captain captive. Present while
   * `captured`, except once that captor is itself eliminated or resigns
   * (#309) — its identity stops mattering the moment there is no one left to
   * ransom, so it is dropped rather than pointing at a dead seat.
   */
  capturedBy?: string
  /**
   * The round at or after which the owner may spend `recruitCaptain` to
   * rehire this captive from the recruitment pool, preserving its name/XP/
   * skills (#309). Set to `round + setup.captainCaptivityRounds` at capture
   * time; `ransomCaptain` pulls it forward to the current round instead of
   * reactivating the captain outright, so a ransomed captive still costs the
   * normal recruit fee to rejoin the fleet. Present iff `captured`.
   */
  captivityReturnRound?: number
  /**
   * Standing multi-turn sail order (#372): the captain auto-continues toward it
   * at the start of each of its owner's turns. Absent when the captain has no
   * standing order. Cleared on manual move/capture. See {@link SailOrder}.
   */
  sailOrder?: SailOrder
  /**
   * True once this captain's anchored flagship was defeated while the captain
   * was ashore leading a landing party (#498): the ship went to the victor
   * (prize flow), but the captain — being ashore — was NOT captured. A
   * ship-lost captain stands with its party (position tracks the party), can
   * take no ship action, and is not a naval target; it is captured only when
   * its party is destroyed. Absent for every captain that still has a hull.
   */
  shipLost?: true
}

/**
 * A standing multi-turn march order for a landing party (#482) — the overland
 * twin of a captain's {@link SailOrder}. A party given a destination beyond
 * its remaining movement keeps marching toward it at the start of each of its
 * owner's turns until it arrives, the route becomes impassable (another party
 * blocks every path, or the destination tile itself is taken), or a *new*
 * contact comes into view — in the latter two cases it pauses (`interrupted`)
 * and waits for the player instead of marching blind into a fresh enemy.
 *
 * Plain JSON so it serializes and replays with the rest of GameState. Absent
 * on a party with no standing order (never `undefined`-valued), so pre-#482
 * saves and every idle party are byte-identical. Fixed-tile destinations only:
 * parties have no intercept orders (a marching column doesn't chase; the AI
 * re-plans each turn instead).
 */
export interface MarchOrder {
  /** The `land` tile being marched to. */
  destination: Coord
  /**
   * Contacts the owner had already sighted when the leg began — the baseline
   * against which a *new* sighting is detected, exactly as in
   * {@link SailOrder.knownContactIds}. Refreshed each turn the order advances
   * without interruption. Sorted, from {@link currentContacts}.
   */
  knownContactIds: string[]
  /**
   * True once the order paused — a new contact appeared, or no land route to
   * the destination currently exists (blocked by another party, or the
   * destination tile is occupied). A paused order stays put until the player
   * re-issues or clears it. Omitted while the order is still actively marching.
   */
  interrupted?: boolean
}

/**
 * A landing party (#465) — a detachment of troops a captain has put ashore.
 * Lives on `land` tiles and moves overland turn by turn; it is a land piece,
 * not a captain (no ship, no XP/skills, no orders). A party whose ship leaves
 * or sinks is stranded until rescued: it persists on the map indefinitely —
 * no attrition, no auto-retreat — and any friendly ship on an adjacent water
 * tile can re-embark it (operator decision, epic #469). Plain JSON so it
 * serializes and replays with the rest of GameState.
 */
export interface LandingParty {
  id: string
  ownerId: string
  name: string
  /** The `land` tile the party stands on. Parties never occupy water/port tiles. */
  position: Coord
  /** Movement points remaining this turn (one point = one land step). */
  movementPoints: number
  /** Movement points granted at the start of each of the owner's turns. */
  maxMovementPoints: number
  /** Never empty: a party that loses its last troop is removed from play. */
  troops: TroopStack[]
  /**
   * Standing multi-turn march order (#482): the party auto-continues toward it
   * at the start of each of its owner's turns. Absent when the party has no
   * standing order. Cleared on manual march. See {@link MarchOrder}.
   */
  marchOrder?: MarchOrder
  /**
   * The captain leading this party ashore (#498), set by a
   * `disembark { withCaptain: true }`. While set, the captain's combat bonuses
   * (skills + stats + items) apply to the party's battles, the captain earns
   * XP from its wins and receives its land finds, and the captain's own ship
   * sits anchored and orderless where it was left. Cleared when the party
   * re-boards that ship (`embark`). Absent on an unled party — byte-identical
   * to a pre-#498 party.
   */
  captainId?: string
}

/**
 * A settlement owned by a player. Buildings are ids into @aop/content's
 * BUILDINGS table — the engine never hardcodes what a building does.
 */
export interface CityState {
  id: string
  ownerId: string
  name: string
  /** The land (port) tile the city sits on, taken from its home island on the generated map. */
  position: Coord
  buildings: string[]
  /** True once this city has constructed a building this round (HoMM one-build-per-turn rule). */
  builtThisRound: boolean
  /** Recruited troops garrisoned in the city, keyed by unit id. */
  garrison: Record<string, number>
  /** Recruits currently available to buy, keyed by unit id (weekly-growth style). */
  unitAvailability: Record<string, number>
  /**
   * The captain stationed in this city (#498, `garrisonCaptain` action).
   * While garrisoned the captain is immobile and its ship + combat bonuses
   * join the city's defence; if the city falls, the garrisoned captain is
   * captured with it. Hidden from enemy views like the rest of the interior.
   * Absent when no captain is stationed.
   */
  garrisonCaptainId?: string
}

/**
 * Opening-state balance data — starting economy, captain loadout, and map
 * geometry. Injected from @aop/content by the caller so the engine holds no
 * balance numbers; frozen into the match for replay/authority determinism.
 */
export interface GameSetup {
  startingGold: number
  startingCaptainMovement: number
  /**
   * Movement points a landing party (#465) regains at the start of each of its
   * owner's turns — one point per land step.
   */
  partyMovementPoints: number
  startingShipClass: string
  homeIslandRadius: number
  /**
   * Per-`MapSize` override of {@link homeIslandRadius} (#468). Only sizes
   * present here deviate from the flat radius above — today just `xlarge` —
   * so small/medium/large generation stays byte-identical to pre-#468 output.
   * The point is bigger island *interiors* on the XL board, not merely a
   * bigger canvas of empty sea; the neutral-island radius formula in
   * `generateMap` derives from the same resolved radius, so neutral islands
   * grow too.
   */
  homeIslandRadiusOverrides?: Partial<Record<MapSize, number>>
  /**
   * Fraction of map size used as the ring radius for placing home island centers
   * around the map centre. Larger values push starts farther apart, delaying first
   * contact and mitigating early rush meta (#322).
   */
  homeIslandRingRadiusFactor: number
  /** Building ids every player's capital begins with. */
  startingBuildings: string[]
  /** Tiles within this Chebyshev radius of an owned city are visible (fog of war, #14). */
  cityVisionRadius: number
  /** Tiles within this Chebyshev radius of an owned captain are visible (fog of war, #14). */
  captainVisionRadius: number
  /** XP the winning captain earns from a decisive naval victory (#21). */
  combatWinXp: number
  /** Reputation every player starts the match with (#138). */
  startingReputation: number
  /** Reputation lost for attacking an ally without leaving the alliance first (#138). */
  betrayalReputationPenalty: number
  /**
   * Truce window (#177): rounds that must pass after leaving an alliance before
   * attacking the ex-ally is a free, penalty-free strike. While fewer than this
   * many rounds have elapsed since the break, hitting the ex-ally still counts
   * as betrayal and costs `betrayalReputationPenalty` — closing the
   * leave-then-strike backstab. `0` disables the truce (immediate free strikes,
   * the pre-#177 behavior). Host-configurable at match setup.
   */
  betrayalTruceRounds: number
  /** Minimum reputation a seat needs to form a new alliance (#138); existing ones are unaffected. */
  allianceReputationMin: number
  /**
   * Base gold cost of the `recruitCaptain` action (#308/#309) — minting a
   * brand-new captain, or rehiring an eligible captive, at an owned port.
   */
  recruitCaptainBaseCost: number
  /**
   * Multiplier applied to `recruitCaptainBaseCost` per live (non-captured)
   * captain this seat already owns, so a snowballing fleet gets steadily
   * pricier instead of unbounded (#309). Recovering from zero captains
   * always costs the base price.
   */
  recruitCaptainCostGrowth: number
  /**
   * Tier-1 troops a freshly recruited (or rehired) captain starts crewed
   * with (#308) — deliberately smaller than a match's starting roster so an
   * early rush can't field full-strength replacements for free.
   */
  recruitCaptainStartingCrew: number
  /**
   * Rounds a captured captain (#309) stays in captivity before its owner may
   * spend `recruitCaptain` to rehire it from the recruitment pool.
   * Host-configurable per match.
   */
  captainCaptivityRounds: number
  /** Base gold cost of the `ransomCaptain` action (#309) — freeing a captive early. */
  ransomBaseCost: number
  /**
   * Gold added to `ransomBaseCost` per XP point the captive has earned
   * (#309) — a veteran captain costs more to buy back.
   */
  ransomXpMultiplier: number
  /**
   * Ship class a rehired captive returns to sea on (#374). Its own ship was
   * handed to its captor as a prize the moment it was captured, so on release
   * it comes back on this hull (upgrades cleared). Omit to fall back to
   * `startingShipClass`.
   */
  ransomReturnShipClassId?: string
  /**
   * Battle resolution mode (#305): `'auto'` (the default) instant-resolves
   * every naval battle exactly as before; `'tactical'` has the client route
   * the human attacker's battles through the interactive round-by-round
   * planner instead. Purely a client UI gate — the engine never reads this
   * field, so it's optional and absent-safe for pre-#305 saves/replays.
   */
  battleResolution?: 'tactical' | 'auto'
}

export interface GameConfig {
  /** Seed for all in-game randomness (and for map generation when {@link mapDefinition} is absent). */
  seed: number
  mapSize: MapSize
  /**
   * Grid topology for the generated map (#389); absent means `square`, so
   * configs frozen before this field existed rebuild identically. Ignored when
   * {@link mapDefinition} is set — an authored map carries its own topology.
   */
  topology?: GridTopology
  /**
   * An authored map (#62) to play instead of generating one from `seed` +
   * `mapSize`. `seed` still drives every other RNG draw (combat, economy,
   * AI), so an authored map replays exactly as deterministically as a
   * generated one. Callers are responsible for validating it first via
   * {@link validateMapDefinition} — `createGame` does not re-validate.
   */
  mapDefinition?: MapDefinition
  players: PlayerConfig[]
  /** Opening-state balance data (economy, captain loadout, map geometry). */
  setup: GameSetup
  /**
   * Combat-relevant stats snapshot, injected from @aop/content by the caller so
   * the engine holds no balance data. Frozen into the match for replay/authority
   * determinism. Required before any combat action can resolve.
   */
  combatStats?: CombatStatsData
  /**
   * Balance tables for economy, recruitment, skills, and ship upgrades, injected
   * from @aop/content the same way as {@link combatStats}. Required before the
   * construct/recruit/skill/upgrade actions can resolve.
   */
  content?: ContentCatalog
  /**
   * Weights and thresholds the single-player AI (#13/#67) uses to score its
   * candidate actions, injected from @aop/content the same way as
   * {@link combatStats}. Without it the AI still plays combat (using built-in
   * fallback scores) but skips every economy decision — building, recruiting,
   * fleet loading, upgrades, and skill picks all require it.
   */
  aiTuning?: AiTuning
  /**
   * Per-personality weight overlays (#25) applied atop {@link aiTuning}, injected
   * from @aop/content. Required for a player's {@link PlayerConfig.aiProfile} to
   * take effect; without it every AI plays the neutral base tuning.
   */
  aiPersonalities?: Record<AiPersonality, AiPersonalityWeights>
  /**
   * Per-difficulty skill modifiers (#25), injected from @aop/content. Governs both
   * the AI's blunder rate and the `hard`-only resource bonus (no cheating on
   * ≤`normal`). Without it every AI plays at full skill with no resource bonus.
   */
  aiDifficulties?: Record<AiDifficulty, AiDifficultyModifier>
  /**
   * Schema/behavior version (#213), stamped by `createGame` with the current
   * {@link RULES_VERSION} regardless of what a caller supplies here — never
   * set this yourself. `applyAction` refuses to run against a state whose
   * stamped value doesn't match the running engine build's `RULES_VERSION`,
   * including a state with none at all (a pre-#213 snapshot). See
   * `rulesVersion.ts`.
   */
  rulesVersion?: number
}

export interface PlayerState {
  id: string
  name: string
  faction: FactionId
  isAI: boolean
  resources: ResourcePool
  eliminated: boolean
  /**
   * Diplomatic standing (#138). Starts at `setup.startingReputation`; betraying
   * an ally (attacking without leaving the alliance first) costs
   * `setup.betrayalReputationPenalty`, floored at 0. Below
   * `setup.allianceReputationMin` a seat can no longer form new alliances.
   * Public information — every seat's reputation is disclosed in player views,
   * so a known oathbreaker carries the mark openly.
   */
  reputation: number
  /**
   * The faction item stash (#498): item ids a captain deposited at a city, or
   * finds that overflowed a captain's carry cap. Stashed items are inert until
   * a docked captain takes them (`takeItem`/`depositItem`).
   */
  itemStash: string[]
  /** AI behavior selection (#25), mirrored from {@link PlayerConfig.aiProfile}. Absent for humans. */
  aiProfile?: AiProfile
}

/**
 * A concluded, mutual alliance between two seats (#136). Stored with the seat
 * ids in a canonical order (`a` &lt; `b`, lexicographically) so a pair has one
 * representation regardless of who proposed — see `canonicalPair` in
 * alliances.ts. Alliances are pairwise, not transitive: allying A–B and B–C
 * does not ally A–C.
 */
export interface AlliancePair {
  a: string
  b: string
}

/**
 * A pending, one-way alliance proposal (#136): `from` proposed on their turn and
 * the offer stands until `to` accepts (on `to`'s own turn — the turn-ordered
 * two-step consent) or either seat is eliminated. Never confers vision or any
 * benefit; only an accepted {@link AlliancePair} does.
 */
export interface AllianceProposal {
  from: string
  to: string
}

/**
 * An alliance left within the last `betrayalTruceRounds` rounds (#177). Stored
 * with the seat ids in canonical order (`a` &lt; `b`, like {@link AlliancePair})
 * plus the `round` the alliance was left, so `attackCaptain` can tell a
 * penalty-free strike (the truce window has elapsed) from a leave-then-strike
 * backstab (it has not) without re-reading the removed pair. Self-cleaning:
 * expired entries are dropped when the next break is recorded, so the list
 * stays bounded to alliances broken inside the current truce window.
 */
export interface BrokenAlliance {
  a: string
  b: string
  /** 1-based {@link GameState.round} in which the alliance was left. */
  round: number
}

/**
 * The dynamic alliance graph (#136) — the single source of truth for who is
 * allied with whom, seeded at game start from {@link PlayerConfig.team} and
 * mutated only by the propose/accept/leave actions through `applyAction()`.
 * Plain JSON so it serializes and replays like the rest of GameState.
 */
export interface AllianceState {
  /** Active mutual alliances, each unordered pair listed once. */
  pairs: AlliancePair[]
  /** Outstanding proposals awaiting the recipient's accept. */
  proposals: AllianceProposal[]
  /**
   * Recently-left alliances still inside the betrayal truce window (#177).
   * Absent when none are pending (and on pre-#177 snapshots, which replay
   * unchanged: no truce entries means no truce protection, matching the
   * behavior those matches were frozen with).
   */
  broken?: BrokenAlliance[]
}

/**
 * A random-encounter entity on the map (#23) — a merchant, native village, or
 * band of settlers a passing captain can interact with. Placed deterministically
 * by mapgen; plain data so it serializes and replays like everything else.
 */
export interface EncounterState {
  id: string
  kind: EncounterKind
  position: Coord
  /** False once resolved; flips back to true when {@link respawnRound} is reached. */
  active: boolean
  /** Round at which a consumed encounter reactivates; null = active, or gone for good. */
  respawnRound: number | null
}

/**
 * An author-placed resource node on the map (#41 map editor, #101) — a fixed
 * tile that grants its `kind`'s resource each round to whichever player
 * currently controls it. Placed only by authored maps (never scattered by
 * mapgen); plain data so it serializes and replays like everything else. See
 * economy.ts's `resourceNodeIncome` for the control rule (occupation by a
 * captain, falling back to {@link ResourceNodeState.ownerSeat}) and the
 * per-round grant.
 */
export interface ResourceNodeState {
  id: string
  kind: ResourceNodeKind
  position: Coord
  /**
   * Author-assigned default controller (#211): seat index into
   * {@link GameState.players}. That player collects the yield whenever no
   * rival captain occupies the tile — the only way a land node (unreachable
   * by water-bound captains) ever yields — and wins the co-occupation
   * tie-break. Absent: the node is neutral, yielding only to an occupant.
   */
  ownerSeat?: number
}

/**
 * A land resource site (#466) — a mine, sawmill, lumber camp, or ruin the map
 * generator scattered on a `land` tile, captured by a landing party that
 * reaches it. Placed deterministically at mapgen; plain data so it serializes
 * and replays like everything else. See economy.ts's `landSiteIncome` for the
 * per-round grant to a hold site's claimant.
 */
export interface LandSiteState {
  id: string
  kind: LandSiteKind
  position: Coord
  /**
   * For a **hold** site (mine/sawmill): the seat that currently claims it —
   * the persistent claim marker. It keeps paying this seat after the claiming
   * party marches away, and only changes when an enemy party captures the site
   * in turn. Absent while unclaimed. Never set on a **haul** site (which pays
   * once on capture and is then spent — see {@link active}).
   */
  claimedBy?: string
  /**
   * True while the site can still be captured. A hold site stays `true` for the
   * life of the match (its claim just changes hands). A haul site flips to
   * `false` the moment it is captured — spent, it never yields again.
   */
  active: boolean
}

/**
 * A land random encounter (#466) — the overland counterpart to a sea
 * {@link EncounterState}, resolved by a landing party rather than a captain.
 * Same lifecycle (`active`/`respawnRound`) and placement determinism; kept in a
 * separate {@link GameState.landEncounters} array so the land side never
 * touches the sea encounter stream.
 */
export interface LandEncounterState {
  id: string
  kind: LandEncounterKind
  position: Coord
  /** False once resolved; flips back to true when {@link respawnRound} is reached. */
  active: boolean
  /** Round at which a consumed land encounter reactivates; null = active, or gone for good. */
  respawnRound: number | null
}

export type GameStatus = 'active' | 'finished'

/**
 * The complete authoritative game state. Must be plain JSON-serializable data:
 * no classes, functions, Dates, Maps, or undefined values in arrays.
 */
export interface GameState {
  config: GameConfig
  /** The generated world map. Derived deterministically from the config seed. */
  map: GameMap
  /** 1-based round number; increments when the last living player ends their turn. */
  round: number
  /** Index into players[] of whoever acts now. */
  currentPlayerIndex: number
  players: PlayerState[]
  /**
   * The dynamic alliance graph (#136): who is allied and which proposals stand.
   * Seeded from {@link PlayerConfig.team} at game start, mutated only via the
   * propose/accept/leave actions. The source of truth for {@link areAllied}.
   */
  alliances: AllianceState
  cities: CityState[]
  /** All captains in play, across all owners. */
  captains: Captain[]
  /** All landing parties ashore (#465), across all owners. */
  parties: LandingParty[]
  /** Random encounters placed by mapgen (#23). Empty when the match has no encounter content. */
  encounters: EncounterState[]
  /** Land resource sites placed by mapgen (#466). Empty when the match has no land-site content. */
  landSites: LandSiteState[]
  /** Land random encounters placed by mapgen (#466). Empty when the match has no land-encounter content. */
  landEncounters: LandEncounterState[]
  /** Author-placed resource nodes (#101). Empty for generated maps and authored maps with none. */
  resourceNodes: ResourceNodeState[]
  /**
   * Every tile each player has ever seen, keyed by playerId, values are
   * "x,y" tile keys. Currently-visible tiles are recomputed on demand by
   * visibility.ts's visibleState() selector — only the persistent history
   * needs to live in state.
   */
  exploredTiles: Record<string, string[]>
  rngState: RngState
  /** Total actions applied; doubles as the action-log sequence cursor. */
  actionCount: number
  status: GameStatus
  winnerId: string | null
}
