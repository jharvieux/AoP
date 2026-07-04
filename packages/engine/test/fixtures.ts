import type {
  AiDifficulty,
  AiDifficultyModifier,
  AiPersonality,
  AiPersonalityWeights,
  AiTuning,
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
  maxSize: 40,
  minPlayers: 2,
  maxPlayers: 8,
  minStartDistance: 5,
  maxHomeIslandAreaRatio: 1.5,
}
