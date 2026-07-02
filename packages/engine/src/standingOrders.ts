import { resolveCombat, totalAttackPower, type ArmyComposition, type CombatResult } from './combat'
import type { ContentCatalog } from './content'
import type { RngState } from './rng'

/**
 * Per-fleet/per-city defensive policy, consulted by the combat driver before
 * a fight is joined. This is what lets async-multiplayer attacks resolve
 * fairly without the defender online (#4), and doubles as the AI's combat
 * brain until real AI planning (#13) lands.
 */
export type StandingOrder = 'fightToTheShip' | 'evadeIfOutgunned'

export const DEFAULT_STANDING_ORDER: StandingOrder = 'fightToTheShip'

export interface EngagementDecision {
  engage: boolean
  reason: 'outgunned' | 'standard'
}

/**
 * Pure: decides whether the defender fights or evades. `evadeIfOutgunned`
 * compares raw attack power (the same number the odds preview and the
 * resolver itself are built from) — no RNG involved, so this decision is
 * fully deterministic given the two army compositions and the order.
 */
export function decideEngagement(
  attackerPower: number,
  defenderPower: number,
  order: StandingOrder,
): EngagementDecision {
  if (order === 'evadeIfOutgunned' && attackerPower > defenderPower) {
    return { engage: false, reason: 'outgunned' }
  }
  return { engage: true, reason: 'standard' }
}

export interface EncounterResult {
  decision: EngagementDecision
  /** Present only when the defender chose to engage. */
  combat?: CombatResult
}

/**
 * The combat driver: applies the defender's standing order, then runs the
 * real resolver only if the defender chooses to fight. Pure — returns the
 * (possibly advanced) RngState alongside the result.
 */
export function resolveEncounter(
  attacker: ArmyComposition,
  defender: ArmyComposition,
  defenderOrder: StandingOrder,
  catalog: ContentCatalog,
  rngState: RngState,
): [RngState, EncounterResult] {
  const decision = decideEngagement(
    totalAttackPower(attacker, catalog),
    totalAttackPower(defender, catalog),
    defenderOrder,
  )
  if (!decision.engage) {
    return [rngState, { decision }]
  }
  const [nextState, combat] = resolveCombat(attacker, defender, catalog, rngState)
  return [nextState, { decision, combat }]
}
