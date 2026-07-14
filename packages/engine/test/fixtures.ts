import type {
  AiDifficulty,
  AiDifficultyModifier,
  AiPersonality,
  AiPersonalityWeights,
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
  aiLosingHpRatio: 0.5,
  aiBoardStrengthRatio: 1.15,
  aggressiveEvadeHpRatio: 0.25,
  cautiousBoardStrengthRatio: 1.4,
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
  rangedCoverDamageReduction: 0.5,
  rangedMeleePenalty: 0.5,
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
  partyMovementPoints: 3,
  startingShipClass: 'sloop',
  homeIslandRadius: 4,
  homeIslandRadiusOverrides: { xlarge: 8 },
  homeIslandRingRadiusFactor: 0.4,
  startingBuildings: ['townhall', 'barracks'],
  cityVisionRadius: 3,
  captainVisionRadius: 2,
  combatWinXp: 40,
  startingReputation: 100,
  betrayalReputationPenalty: 40,
  betrayalTruceRounds: 2,
  allianceReputationMin: 30,
  recruitCaptainBaseCost: 400,
  recruitCaptainCostGrowth: 1.5,
  recruitCaptainStartingCrew: 3,
  captainCaptivityRounds: 5,
  ransomBaseCost: 200,
  ransomXpMultiplier: 2,
}

export const AI_TUNING: AiTuning = {
  engageMinRatio: 0.9,
  attritionMinRatio: 0.4,
  attritionScoreMult: 0.5,
  siegeStickinessBonus: 40,
  landAssaultBonus: 30,
  partyRescueScoreBase: 15,
  reinforceCityScoreBase: 60,
  partyThreatRadius: 3,
  partyThreatMinRatio: 0.4,
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
  statPickScoreBase: 90,
  recruitCaptainScoreBase: 500,
  ransomScoreBase: 50,
}

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

export const AI_DIFFICULTIES: Record<AiDifficulty, AiDifficultyModifier> = {
  easy: { blunderChance: 0.35, incomeMult: 1 },
  normal: { blunderChance: 0, incomeMult: 1 },
  hard: { blunderChance: 0, incomeMult: 1.25 },
}

export const MAP_VALIDATION_LIMITS: MapValidationLimits = {
  minSize: 24,
  maxSize: 96, // mirrors @aop/content's real value (4x-area quadrupling; was 48 per #473)
  minPlayers: 2,
  maxPlayers: 8,
  minStartDistance: 5,
  maxHomeIslandAreaRatio: 1.5,
}
