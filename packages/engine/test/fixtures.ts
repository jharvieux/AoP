import type {
  AiTuning,
  BattleTuning,
  CombatTuning,
  GameSetup,
  MapValidationLimits,
  TacticsTuning,
} from '../src'

/**
 * Balance-tuning fixtures for engine tests. In production these come from
 * @aop/content and are frozen into the match config; the engine itself holds no
 * balance numbers, so tests inject their own snapshot here.
 */

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
  boardingBlockedDensity: 0.12,
  boardingRoughDensity: 0,
  boardingCoverDensity: 0.06,
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
  startingBuildings: ['townhall'],
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

export const MAP_VALIDATION_LIMITS: MapValidationLimits = {
  minSize: 24,
  maxSize: 40,
  minPlayers: 2,
  maxPlayers: 8,
  minStartDistance: 5,
  maxHomeIslandAreaRatio: 1.5,
}
