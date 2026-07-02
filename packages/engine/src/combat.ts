import type { ContentCatalog } from './content'
import { nextInt, seedRng, type RngState } from './rng'

/**
 * A minimal, real combat resolver. Full tactical combat (positioning, terrain,
 * formations) is #12/#18's scope — this is the just-enough groundwork #19's
 * odds preview and auto-resolve UI need to have something real to call.
 */

/** Troop counts keyed by unit id, e.g. `{ deckhand: 4, cutthroat: 1 }`. */
export type ArmyComposition = Record<string, number>

export interface CombatRoundLog {
  round: number
  attackerDamageDealt: number
  defenderDamageDealt: number
  attackerRemaining: number
  defenderRemaining: number
}

export interface CombatResult {
  winner: 'attacker' | 'defender' | 'draw'
  rounds: number
  attackerLosses: ArmyComposition
  defenderLosses: ArmyComposition
  attackerSurvivors: ArmyComposition
  defenderSurvivors: ArmyComposition
  /** Round-by-round breakdown, in order — what an animated battle report plays back. */
  log: CombatRoundLog[]
}

const MAX_ROUNDS = 50

function armyCount(army: ArmyComposition): number {
  return Object.values(army).reduce((sum, n) => sum + n, 0)
}

function totalAttackPower(army: ArmyComposition, catalog: ContentCatalog): number {
  return Object.entries(army).reduce((sum, [unitId, count]) => {
    const def = catalog.units[unitId]
    return sum + (def ? def.attack * count : 0)
  }, 0)
}

/**
 * Applies `damage` health worth of casualties to the weakest (lowest-tier)
 * units first, mitigated by each unit's defense stat. Returns the surviving
 * army and the losses taken, keyed by unit id.
 */
function applyDamage(
  army: ArmyComposition,
  damage: number,
  catalog: ContentCatalog,
): { survivors: ArmyComposition; losses: ArmyComposition } {
  const order = Object.keys(army)
    .filter((id) => army[id]! > 0)
    .sort((a, b) => (catalog.units[a]?.tier ?? 1) - (catalog.units[b]?.tier ?? 1))

  const survivors: ArmyComposition = { ...army }
  const losses: ArmyComposition = {}
  let remaining = damage

  for (const unitId of order) {
    if (remaining <= 0) break
    const def = catalog.units[unitId]
    if (!def) continue
    const effectiveHealth = Math.max(1, def.health - def.defense)
    const count = survivors[unitId] ?? 0
    const killed = Math.min(count, Math.floor(remaining / effectiveHealth))
    if (killed > 0) {
      survivors[unitId] = count - killed
      losses[unitId] = killed
      remaining -= killed * effectiveHealth
    }
  }

  return { survivors, losses }
}

function mergeLosses(a: ArmyComposition, b: ArmyComposition): ArmyComposition {
  const merged: ArmyComposition = { ...a }
  for (const [unitId, count] of Object.entries(b)) {
    merged[unitId] = (merged[unitId] ?? 0) + count
  }
  return merged
}

/**
 * Resolves one battle round-by-round until one side is wiped out or
 * MAX_ROUNDS is hit (declared a draw). Pure and deterministic: returns the
 * advanced RngState alongside the result so callers decide whether to keep
 * it (real combat, using GameState.rngState) or discard it (Monte Carlo
 * odds preview, using a scratch RngState that never touches game state).
 */
export function resolveCombat(
  attacker: ArmyComposition,
  defender: ArmyComposition,
  catalog: ContentCatalog,
  rngState: RngState,
): [RngState, CombatResult] {
  let atk: ArmyComposition = { ...attacker }
  let def: ArmyComposition = { ...defender }
  let attackerLosses: ArmyComposition = {}
  let defenderLosses: ArmyComposition = {}
  let state = rngState
  let rounds = 0
  const log: CombatRoundLog[] = []

  while (armyCount(atk) > 0 && armyCount(def) > 0 && rounds < MAX_ROUNDS) {
    rounds += 1
    const atkPower = totalAttackPower(atk, catalog)
    const defPower = totalAttackPower(def, catalog)

    let atkRoll: number
    let defRoll: number
    ;[state, atkRoll] = nextInt(state, 85, 115)
    ;[state, defRoll] = nextInt(state, 85, 115)

    const dmgToDefender = Math.round((atkPower * atkRoll) / 100)
    const dmgToAttacker = Math.round((defPower * defRoll) / 100)

    const defResult = applyDamage(def, dmgToDefender, catalog)
    const atkResult = applyDamage(atk, dmgToAttacker, catalog)

    def = defResult.survivors
    atk = atkResult.survivors
    defenderLosses = mergeLosses(defenderLosses, defResult.losses)
    attackerLosses = mergeLosses(attackerLosses, atkResult.losses)

    log.push({
      round: rounds,
      attackerDamageDealt: dmgToDefender,
      defenderDamageDealt: dmgToAttacker,
      attackerRemaining: armyCount(atk),
      defenderRemaining: armyCount(def),
    })
  }

  const attackerAlive = armyCount(atk) > 0
  const defenderAlive = armyCount(def) > 0
  const winner = attackerAlive === defenderAlive ? 'draw' : attackerAlive ? 'attacker' : 'defender'

  return [
    state,
    {
      winner,
      rounds,
      attackerLosses,
      defenderLosses,
      attackerSurvivors: atk,
      defenderSurvivors: def,
      log,
    },
  ]
}

export interface CombatOdds {
  attackerWinProbability: number
  defenderWinProbability: number
  drawProbability: number
  trials: number
}

/**
 * Monte Carlo odds estimate: runs `trials` independent battles through the
 * real resolveCombat() using a scratch RNG seeded by `scratchSeed`. Never
 * touches GameState.rngState — callers pass their own seed (e.g. Date.now()
 * on the client) so this stays a pure function of its arguments.
 */
export function estimateOdds(
  attacker: ArmyComposition,
  defender: ArmyComposition,
  catalog: ContentCatalog,
  scratchSeed: number,
  trials = 200,
): CombatOdds {
  let state = seedRng(scratchSeed)
  let attackerWins = 0
  let defenderWins = 0
  let draws = 0

  for (let i = 0; i < trials; i++) {
    let result: CombatResult
    ;[state, result] = resolveCombat(attacker, defender, catalog, state)
    if (result.winner === 'attacker') attackerWins += 1
    else if (result.winner === 'defender') defenderWins += 1
    else draws += 1
  }

  return {
    attackerWinProbability: attackerWins / trials,
    defenderWinProbability: defenderWins / trials,
    drawProbability: draws / trials,
    trials,
  }
}
