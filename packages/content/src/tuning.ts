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

export const GAME_SETUP: GameSetup = {
  startingGold: 1000,
  startingCaptainMovement: 5,
  startingShipClass: 'sloop',
  homeIslandRadius: 2,
}
