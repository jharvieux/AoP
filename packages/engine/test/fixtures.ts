import type { CombatTuning, GameSetup, TacticsTuning } from '../src'

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
}
