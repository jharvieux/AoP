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
  /** Building ids every player's capital begins with. */
  startingBuildings: string[]
  /** Tiles within this Chebyshev radius of an owned city are visible (fog of war, #14). */
  cityVisionRadius: number
  /** Tiles within this Chebyshev radius of an owned captain are visible (fog of war, #14). */
  captainVisionRadius: number
  /** XP the winning captain earns from a decisive naval victory (#21). */
  combatWinXp: number
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
  startingBuildings: [...STARTING_BUILDINGS],
  cityVisionRadius: 3,
  captainVisionRadius: 2,
  combatWinXp: 40,
}

export const AI_TUNING: AiTuning = {
  engageMinRatio: 0.9,
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
  buildScoreScale: 0.5,
  recruitScoreBase: 25,
  recruitSpendFraction: 0.5,
  garrisonToShipScoreBase: 30,
  garrisonReserveFraction: 0.3,
  upgradeScoreBase: 20,
  skillPickScoreBase: 90,
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
