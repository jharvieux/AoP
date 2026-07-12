import type { FactionId } from '@aop/shared'
import { STARTING_BUILDINGS } from './buildings'

/**
 * Tuned balance constants — the numbers a designer turns to shape combat, the
 * economy, and the opening loadout. They live here (never in @aop/engine, which
 * is pure and holds no balance data) and are frozen into a match's config so
 * replays and multiplayer authority stay deterministic. Same injection pattern
 * as the combat rosters in {@link combatStatsData}.
 */

/** Weights for the engine's combat round resolver. */
export interface CombatTuning {
  /** Hard cap on rounds before a battle is called on remaining hit points. */
  maxRounds: number
  /** Minimum of the per-round damage roll (floor of the [min, min+spread] band). */
  damageRollMin: number
  /** Width of the per-round damage roll band above the minimum. */
  damageRollSpread: number
  /** How much a ship's hull contributes to fighting strength. */
  hullStrengthWeight: number
  /** How much a ship's cannons contribute to fighting strength. */
  cannonStrengthWeight: number
  /** How much a unit's defense adds to its offensive contribution. */
  troopDefenseWeight: number
  /**
   * Fraction of raw strength dealt as damage per round. Tuned via the balance
   * harness (#24): stretches duels to ~6-8 rounds so the stronger fleet reliably
   * pulls ahead instead of both sides being destroyed in the same round.
   */
  damageScale: number
}

/** Knobs for the hybrid-tactics layer (#18). */
export interface TacticsTuning {
  /** Damage multiplier a tactic gets against the one it beats. */
  advantage: number
  /** Damage multiplier a tactic suffers against the one that beats it. */
  disadvantage: number
  /** Minimum hull a ship needs before it can bring a ram to bear. */
  ramHullMin: number
  /** How badly outweighed a fleet must be before the 'outgunned' order fires. */
  outgunnedRatio: number
  /** HP ratio below which the default AI driver treats the fight as clearly lost (#212). */
  aiLosingHpRatio: number
  /** Strength ratio the default AI driver needs before it commits to a board (#212). */
  aiBoardStrengthRatio: number
  /** HP ratio below which the aggressive personality breaks off instead of pressing (#212). */
  aggressiveEvadeHpRatio: number
  /** Strength ratio the cautious personality needs before it commits to a board (#212). */
  cautiousBoardStrengthRatio: number
}

/**
 * Knobs for the tactical battle board (#39) — board geometry, terrain
 * densities, and the melee damage model. Mirrors the engine's `BattleTuning`
 * shape (content stays dependency-free). Its presence in a match's frozen
 * combat-stats snapshot is what enables boarding melees at all; pre-#39
 * snapshots lack it and replay unchanged.
 */
export interface BattleTuning {
  boardWidth: number
  boardHeight: number
  maxStacksPerSide: number
  maxRounds: number
  /** Board speed used for units whose stats predate the speed field. */
  defaultUnitSpeed: number
  damageRollMin: number
  damageRollSpread: number
  /** Damage multiplier slope per point of (attack − defense). */
  attackDefenseFactor: number
  minDamageModifier: number
  maxDamageModifier: number
  /** Damage multiplier when a second friendly stack is adjacent to the target. */
  flankingBonus: number
  /** Fraction of damage absorbed by a target standing on cover terrain. */
  coverDamageReduction: number
  /**
   * Fraction of a ranged shot absorbed by a target on cover (#94) — soft cover
   * foils archers more than melee, so typically higher than
   * {@link coverDamageReduction}. Replaces (not stacks with) the melee cover
   * reduction for ranged shots.
   */
  rangedCoverDamageReduction: number
  /**
   * Damage multiplier for a ranged unit fighting an adjacent enemy in melee
   * (#94) — the HoMM archer penalty. Below 1; such a blow still draws retaliation.
   */
  rangedMeleePenalty: number
  /** Fraction of damage absorbed by a target that held (defensive posture). */
  holdDamageReduction: number
  /** Movement cost of a rough hex (open and cover hexes cost 1). */
  roughMoveCost: number
  boardingBlockedDensity: number
  boardingRoughDensity: number
  boardingCoverDensity: number
  landBlockedDensity: number
  landRoughDensity: number
  landCoverDensity: number
  /** HP ratio at which the 'outnumbered' board standing order fires. */
  outnumberedRatio: number
}

/**
 * Weights and thresholds for the single-player AI (#13/#67). Every knob the AI
 * uses to score a candidate action lives here so difficulty/behavior tuning
 * never touches @aop/engine, which holds no balance data of its own.
 */
export interface AiTuning {
  /** Minimum strength ratio (mine ÷ enemy) before the AI will attack or advance on a target. */
  engageMinRatio: number
  /**
   * Attrition floor for city assaults (#462): the minimum troops-only strength
   * ratio (mine ÷ garrison) at which the AI will land an assault it does NOT
   * expect to win outright, purely to thin a garrison that persists between
   * assaults (recruit pools replenish only every {@link RECRUIT_REPLENISH_INTERVAL}
   * rounds). Below `engageMinRatio` but above this, the assault is a deliberate
   * attrition wave; below this the landing party is too weak to dent the
   * defenders and would just feed the captain to the turrets, so the AI holds.
   * Kept strictly below `engageMinRatio` (else the band is empty). Scaled by the
   * same personality `engageMinRatioMult` as `engageMinRatio`.
   */
  attritionMinRatio: number
  /**
   * Score multiplier (<1) applied to an attrition assault/approach relative to a
   * winning one (#462), so a genuine win is always preferred and a doomed
   * attrition wave still outranks idling. Because the assault score rises with
   * the ratio, each successful thinning makes the next wave on the weakened city
   * score higher — the "follow-up assaults score higher" behavior, for free.
   */
  attritionScoreMult: number
  /** Score for a legal attack, scaled by strength ratio. */
  attackScoreBase: number
  /** Base score for advancing toward a beatable but distant enemy. */
  advanceScoreBase: number
  /** Bonus atop advanceScoreBase, scaled by closeness (1 / (1 + distance)). */
  advanceDistanceBonus: number
  /** Gold reserve the AI never spends below — its rainy-day buffer. */
  minGoldReserve: number
  /** Utility weight per point of gold a constructible building produces per round. */
  buildGoldWeight: number
  /** Utility weight per point of timber produced. */
  buildTimberWeight: number
  /** Utility weight per point of iron produced. */
  buildIronWeight: number
  /** Utility weight per point of rum produced. */
  buildRumWeight: number
  /** Utility weight per recruitment tier a building unlocks. */
  buildRecruitTierWeight: number
  /** Utility weight per point of fortification defense bonus. */
  buildDefenseBonusWeight: number
  /** Flat utility bonus for the building that unlocks ship upgrades. */
  buildShipyardBonus: number
  /**
   * Utility bonus for the building that unlocks captain recruitment (tavern,
   * #433). Applied only while the seat is captain-less with no tavern anywhere
   * (#439) — recovery is existential then, so this must outrank every ordinary
   * building's utility (the full tree tops out at grandArsenal's 4×20=80).
   */
  buildTavernBonus: number
  /** Scales a building's raw utility score into the shared action-score space. */
  buildScoreScale: number
  /** Score for recruiting troops, once gold is above the reserve. */
  recruitScoreBase: number
  /** Fraction of gold above the reserve the AI will spend recruiting in one action. */
  recruitSpendFraction: number
  /** Score for moving troops from a city garrison onto a docked captain's ship. */
  garrisonToShipScoreBase: number
  /** Fraction of each garrisoned unit stack the AI keeps in the city for defense. */
  garrisonReserveFraction: number
  /** Score for buying the next ship-upgrade level, once gold is above the reserve. */
  upgradeScoreBase: number
  /** Score for spending an available captain skill pick. */
  skillPickScoreBase: number
  /**
   * Score for recruiting a replacement captain when captain-less (#308).
   * Tuned to comfortably outscore any economy action — recovering from zero
   * captains is existential, not a discretionary investment.
   */
  recruitCaptainScoreBase: number
  /** Score for ransoming an eligible captive when outnumbered and affordable (#309). */
  ransomScoreBase: number
}

/** Opening game state: starting economy, captain loadout, and map geometry. */
export interface GameSetup {
  /** Gold each player starts with. */
  startingGold: number
  /** Movement points a starting captain regains each turn. */
  startingCaptainMovement: number
  /** Flagship class every player starts with until shipyards are built. */
  startingShipClass: string
  /** Radius (in tiles) of each identical home-island disc. */
  homeIslandRadius: number
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
  /**
   * Reputation lost for betrayal (#138) — attacking an ally without leaving the
   * alliance first. The primary betrayal-cost knob: raise it to make treachery
   * rarer, lower it to make alliances more fluid. Host-configurable per match
   * (#177); the default here is the slider's opening value.
   */
  betrayalReputationPenalty: number
  /**
   * Betrayal truce window (#177): rounds that must elapse after leaving an
   * alliance before attacking the ex-ally is a free, penalty-free strike. Until
   * then, hitting the ex-ally still costs `betrayalReputationPenalty` — so
   * leaving first no longer buys a free same-turn backstab (the #177 gap). `0`
   * disables the truce (immediate free strikes, the pre-#177 behavior).
   * Host-configurable per match; the default here is the slider's opening value.
   */
  betrayalTruceRounds: number
  /**
   * Minimum reputation a seat needs to form a NEW alliance (#138) — below it,
   * proposals involving that seat are rejected. Existing alliances are
   * unaffected. With the defaults (100 start, −40 per betrayal, floor 30) one
   * betrayal leaves diplomacy open; a second closes it for the match.
   */
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
   * Host-configurable per match; the default here is the slider's opening
   * value.
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
   * Battle resolution mode (#305): `'auto'` instant-resolves every naval
   * battle (the pre-#305 behavior); `'tactical'` routes the human attacker's
   * battles through the interactive round-by-round planner instead. A purely
   * client-side UI gate — the engine itself never reads this field.
   */
  battleResolution?: 'tactical' | 'auto'
}

/**
 * Automatic city-defense tuning (#435) — the militia and turrets every attacked
 * city fields *in addition to* its recruited garrison, so no city is ever a free
 * capture. Every number here is balance data: the engine derives the defenders
 * at battle time from these knobs plus the city's own faction and unlocked
 * recruit tier, and never hardcodes any of them.
 */
export interface CityDefenseTuning {
  /** Free militia troops of each unit type available in the city (per type). */
  militiaPerType: number
  /** Number of stationary defensive turrets deployed at the defender's edge. */
  turretCount: number
  /**
   * Faction whose roster arms a neutral (unowned) city's militia and turrets
   * (operator decision, 2026-07-11): expansion always costs troops, and a
   * neutral city defends from this roster. A content-data choice, not hardcoded.
   */
  neutralRosterFactionId: FactionId
  /** Board attack range (hexes) of a turret — makes it a ranged defender piece. */
  turretRange: number
  /** Board initiative speed of a turret (it never moves; this only ranks its shot). */
  turretSpeed: number
  /** Turret health as a multiple of the highest-tier available unit's health. */
  turretHealthMult: number
  /** Turret attack as a multiple of the highest-tier available unit's attack. */
  turretAttackMult: number
  /** Turret defense as a multiple of the highest-tier available unit's defense. */
  turretDefenseMult: number
}

// Calibrated against the #442 assault probes (landing party vs militia-only
// city, 20 seeds per cell, both roster directions): a base-capacity raid of 4
// tier-1 troops loses (0-55% win, and it scores below the AI's 0.9 engage
// gate), a committed starting party of 6 wins (90-100% at ratio 0.95-1.06, so
// the AI engages), and anything bigger takes the city reliably. The original
// guess (militiaPerType 5, plain turrets) made a 6-troop assault score 0.86 —
// the AI refused fights it would actually win, and the militia wall, not the
// turrets, did all the work. Fewer militia + meaner turrets keeps "no free
// capture" while restoring conquest appetite.
export const CITY_DEFENSE_TUNING: CityDefenseTuning = {
  militiaPerType: 3,
  turretCount: 2,
  neutralRosterFactionId: 'pirates',
  // Long enough to open fire before the attacker crosses an 11-wide board, but
  // short of covering the whole field, so an attacker can still stage out of arc.
  turretRange: 4,
  turretSpeed: 3,
  turretHealthMult: 2,
  turretAttackMult: 1.5,
  turretDefenseMult: 1,
}

export const COMBAT_TUNING: CombatTuning = {
  maxRounds: 20,
  damageRollMin: 0.85,
  damageRollSpread: 0.3,
  hullStrengthWeight: 0.25,
  cannonStrengthWeight: 1,
  troopDefenseWeight: 0.5,
  damageScale: 0.35,
}

export const TACTICS_TUNING: TacticsTuning = {
  advantage: 1.25,
  disadvantage: 0.8,
  ramHullMin: 50,
  outgunnedRatio: 1.5,
  aiLosingHpRatio: 0.5,
  aiBoardStrengthRatio: 1.15,
  aggressiveEvadeHpRatio: 0.25,
  cautiousBoardStrengthRatio: 1.4,
}

export const BATTLE_TUNING: BattleTuning = {
  // 11×8 fills a phone in landscape without scrolling and gives a 5-6 turn
  // closing march at speed 4-6 — room for maneuver, fast to resolve.
  boardWidth: 11,
  boardHeight: 8,
  maxStacksPerSide: 7,
  maxRounds: 30,
  defaultUnitSpeed: 4,
  damageRollMin: 0.9,
  damageRollSpread: 0.2,
  attackDefenseFactor: 0.05,
  minDamageModifier: 0.4,
  maxDamageModifier: 2,
  flankingBonus: 1.2,
  coverDamageReduction: 0.25,
  rangedCoverDamageReduction: 0.5,
  rangedMeleePenalty: 0.5,
  holdDamageReduction: 0.15,
  roughMoveCost: 2,
  // A ship's deck: cluttered with masts and hatches, no soft going.
  boardingBlockedDensity: 0.12,
  boardingRoughDensity: 0,
  boardingCoverDensity: 0.06,
  // Open ground: fewer hard walls, more scrub and undergrowth.
  landBlockedDensity: 0.08,
  landRoughDensity: 0.12,
  landCoverDensity: 0.1,
  outnumberedRatio: 1.5,
}

export const GAME_SETUP: GameSetup = {
  startingGold: 1000,
  startingCaptainMovement: 5,
  startingShipClass: 'sloop',
  homeIslandRadius: 2,
  // Increased from 0.34 to 0.40 to slow first contact (#322); home islands now
  // sit ~2 tiles farther apart, reducing early rush timing pressure.
  homeIslandRingRadiusFactor: 0.4,
  startingBuildings: [...STARTING_BUILDINGS],
  cityVisionRadius: 3,
  captainVisionRadius: 2,
  combatWinXp: 40,
  startingReputation: 100,
  betrayalReputationPenalty: 40,
  // Two rounds: after leaving, both the break round and the next round still
  // count as betrayal, so the ex-ally gets at least one full turn cycle of
  // warning before the strike goes free — a one-round window could let an
  // attacker who left just before the victim's turn strike almost immediately.
  betrayalTruceRounds: 2,
  allianceReputationMin: 30,
  // Recovering from zero captains costs the base price; each additional live
  // captain beyond that raises the next one's cost by 50% (#309), so fleets
  // stay bounded without a hard cap.
  recruitCaptainBaseCost: 400,
  recruitCaptainCostGrowth: 1.5,
  recruitCaptainStartingCrew: 3,
  // Five rounds: long enough that a captured captain is genuinely off the
  // board for a while (the point of capture over instant re-recruitment),
  // short enough that a slow game doesn't strand a captor's prize forever.
  captainCaptivityRounds: 5,
  ransomBaseCost: 200,
  ransomXpMultiplier: 2,
  // Rehired captives return on the same starter hull a fresh captain gets
  // (#374); the captured ship itself became the captor's prize.
  ransomReturnShipClassId: 'sloop',
  // Default single-player games to interactive tactical combat so the tactical
  // systems are visible by default (#343); auto stays selectable in New Game
  // Setup. Config is captured per-game at setup, so saves/replays are unaffected.
  battleResolution: 'tactical',
}

/**
 * How many rounds elapse between city recruit-pool replenishments (#453).
 *
 * A city's `unitAvailability` (the recruits it may buy) is seeded when the match
 * starts and then tops up by each unit's `weeklyGrowth` on a cadence. At `1` it
 * refreshes every round; raising it to `5` slows the defender-garrison snowball
 * five-fold, so a crew-capacity-capped landing party can actually reach the
 * strength of a besieged city's garrison. Balance data, not an engine constant —
 * the reducer reads it from the frozen catalog so replays stay deterministic.
 *
 * Changing this alters the meaning of the round counter for recruitment, so it
 * is a replay-breaking change: bump `RULES_VERSION` in lock-step (currently v4).
 */
export const RECRUIT_REPLENISH_INTERVAL = 5

export const AI_TUNING: AiTuning = {
  engageMinRatio: 0.9,
  // 0.40: a landing party at ≥40% of the defenders' troops-only strength kills a
  // meaningful chunk before falling, so successive waves (or fresh captains) grind
  // a city the AI can't yet beat outright down to beatable — the #462 attrition
  // arc. Sim-tuned: on the 96-match battery this lifts conquest from 3 → 13 with
  // visible multi-wave arcs; below ~0.38 conquest roughly doubles again but the AI
  // sheds noticeably more captains (less cost-effective), so 0.40 is the bounded
  // choice. A party weaker than this floor is too slight to dent the garrison and
  // just feeds its captain to the turrets. (Scaled by personality engageMinRatioMult.)
  attritionMinRatio: 0.4,
  attritionScoreMult: 0.5,
  attackScoreBase: 100,
  advanceScoreBase: 10,
  advanceDistanceBonus: 10,
  minGoldReserve: 150,
  buildGoldWeight: 1,
  buildTimberWeight: 4,
  buildIronWeight: 6,
  buildRumWeight: 6,
  buildRecruitTierWeight: 20,
  buildDefenseBonusWeight: 1,
  buildShipyardBonus: 25,
  buildTavernBonus: 100,
  buildScoreScale: 0.5,
  recruitScoreBase: 25,
  recruitSpendFraction: 0.5,
  garrisonToShipScoreBase: 30,
  garrisonReserveFraction: 0.3,
  upgradeScoreBase: 20,
  skillPickScoreBase: 90,
  recruitCaptainScoreBase: 500,
  ransomScoreBase: 50,
}

/**
 * AI personalities & difficulty (#25). These overlays and modifiers are balance
 * data, so — like {@link AiTuning} — they live here and get frozen into a match's
 * config. The type shapes mirror @aop/engine's `AiPersonalityWeights` /
 * `AiDifficultyModifier`; @aop/content never imports @aop/engine (the engine
 * stays the leaf), so they are restated structurally here.
 */
export type AiPersonality = 'aggressive' | 'economic' | 'opportunist'
export type AiDifficulty = 'easy' | 'normal' | 'hard'

export interface AiPersonalityWeights {
  combatScoreMult: number
  engageMinRatioMult: number
  economyScoreMult: number
  minGoldReserveMult: number
}

export interface AiDifficultyModifier {
  blunderChance: number
  incomeMult: number
}

/**
 * Weight overlays multiplied into {@link AI_TUNING} per personality:
 * - aggressive: fights hard and often (higher combat scores, a far lower engage
 *   threshold), spends its reserve freely, and under-invests in economy.
 * - economic: hoards gold and builds up (higher economy scores + reserve) and
 *   only fights from a clear advantage (raised engage threshold).
 * - opportunist: a balanced raider — slightly combat-leaning but pickier about
 *   its fights, closing on targets it can beat while it keeps developing.
 */
export const AI_PERSONALITIES: Record<AiPersonality, AiPersonalityWeights> = {
  aggressive: {
    combatScoreMult: 1.6,
    engageMinRatioMult: 0.7,
    economyScoreMult: 0.9,
    minGoldReserveMult: 0.6,
  },
  economic: {
    combatScoreMult: 0.8,
    engageMinRatioMult: 1.3,
    economyScoreMult: 1.6,
    minGoldReserveMult: 1.6,
  },
  opportunist: {
    combatScoreMult: 1.15,
    engageMinRatioMult: 1.1,
    economyScoreMult: 1.1,
    minGoldReserveMult: 1,
  },
}

/**
 * Difficulty modifiers. `blunderChance` is how often the AI takes its runner-up
 * move instead of its best; `incomeMult` is a per-round resource bonus. Per #25,
 * `incomeMult` MUST stay 1 for `easy`/`normal` (no resource cheating) — only
 * `hard` collects a bonus.
 */
export const AI_DIFFICULTIES: Record<AiDifficulty, AiDifficultyModifier> = {
  easy: { blunderChance: 0.35, incomeMult: 1 },
  normal: { blunderChance: 0, incomeMult: 1 },
  hard: { blunderChance: 0, incomeMult: 1.25 },
}

/**
 * Bounds an authored {@link MapDefinition} (@aop/engine, #62) must satisfy.
 * Mirrors the engine's `MapValidationLimits` shape so `validateMapDefinition`
 * can be called with this data without the engine importing @aop/content.
 */
export interface MapValidationLimits {
  minSize: number
  maxSize: number
  minPlayers: number
  maxPlayers: number
  minStartDistance: number
  maxHomeIslandAreaRatio: number
}

export const MAP_VALIDATION_LIMITS: MapValidationLimits = {
  // Matches the smallest/largest entries in the engine's MAP_DIMENSIONS table
  // (see map.ts) so authored maps span the same range generated ones do.
  minSize: 24,
  maxSize: 40,
  minPlayers: 2,
  maxPlayers: 8,
  // Same crowding floor the generated-map fairness tests enforce (map.test.ts).
  minStartDistance: 5,
  // Generated maps are perfectly symmetric (ratio 1); authored maps get
  // slack for hand-sculpted islands that aren't pixel-identical.
  maxHomeIslandAreaRatio: 1.5,
}
