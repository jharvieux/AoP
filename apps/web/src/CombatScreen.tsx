import {
  boostedCatalog,
  estimateOdds,
  resolveCombat,
  seedRng,
  type ArmyComposition,
  type CombatBonus,
  type CombatResult,
  type ContentCatalog,
} from '@aop/engine'
import type { UnitDef } from '@aop/content'
import type { FactionId } from '@aop/shared'
import { useMemo, useState } from 'react'

interface CombatScreenProps {
  attackerGarrison: ArmyComposition
  attackerRoster: UnitDef[]
  attackerFactionId: FactionId
  /** Captain skill bonuses (#21) applied to the attacker's roster before drilling. */
  attackerBonus: CombatBonus
  opponentRoster: UnitDef[]
  catalog: ContentCatalog
  onClose: () => void
  /** Called once per decisive drill win — the client turns this into a gainCaptainXp action. */
  onVictory?: () => void
}

const ODDS_TRIALS = 200

function armyLabel(army: ArmyComposition, roster: Record<string, { name: string }>): string {
  const parts = Object.entries(army)
    .filter(([, count]) => count > 0)
    .map(([id, count]) => `${count} ${roster[id]?.name ?? id}`)
  return parts.length > 0 ? parts.join(', ') : 'None'
}

/**
 * Pre-battle odds preview + auto-resolve with an animated battle report.
 * There is no real cross-player attack trigger yet (map contact lands with
 * #8/#12/#18) — this drills the actual combat resolver against an
 * adjustable sparring-partner composition so the odds/report UI has
 * something genuine to show.
 */
export function CombatScreen({
  attackerGarrison,
  attackerRoster,
  attackerFactionId,
  attackerBonus,
  opponentRoster,
  catalog,
  onClose,
  onVictory,
}: CombatScreenProps) {
  const attackerRosterById = useMemo(
    () => Object.fromEntries(attackerRoster.map((u) => [u.id, u])),
    [attackerRoster],
  )
  const rosterById = useMemo(
    () => Object.fromEntries(opponentRoster.map((u) => [u.id, u])),
    [opponentRoster],
  )
  const [opponent, setOpponent] = useState<ArmyComposition>(() =>
    Object.fromEntries(opponentRoster.slice(0, 2).map((u) => [u.id, 3])),
  )
  const [result, setResult] = useState<CombatResult | null>(null)
  const [revealedRounds, setRevealedRounds] = useState(0)

  // A captain's skill bonuses (#21) apply only to their own faction's roster.
  const effectiveCatalog = useMemo(
    () => boostedCatalog(catalog, attackerBonus, attackerFactionId),
    [catalog, attackerBonus, attackerFactionId],
  )

  // Recomputed whenever the hypothetical opponent composition changes.
  const odds = useMemo(
    () => estimateOdds(attackerGarrison, opponent, effectiveCatalog, Date.now(), ODDS_TRIALS),
    [attackerGarrison, opponent, effectiveCatalog],
  )

  function adjustOpponent(unitId: string, delta: number) {
    setOpponent((prev) => ({ ...prev, [unitId]: Math.max(0, (prev[unitId] ?? 0) + delta) }))
    setResult(null)
    setRevealedRounds(0)
  }

  function autoResolve() {
    // A practice bout: seeded from the clock since it never advances the
    // authoritative GameState.rngState (the same rule Monte Carlo follows).
    // A decisive win still earns the visiting captain real XP (#21), via
    // onVictory -> a genuine gainCaptainXp action dispatched by the caller.
    const [, outcome] = resolveCombat(
      attackerGarrison,
      opponent,
      effectiveCatalog,
      seedRng(Date.now()),
    )
    setResult(outcome)
    setRevealedRounds(0)
    outcome.log.forEach((_, i) => {
      setTimeout(() => setRevealedRounds((n) => Math.max(n, i + 1)), (i + 1) * 350)
    })
    if (outcome.winner === 'attacker') onVictory?.()
  }

  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet" onClick={(e) => e.stopPropagation()}>
        <div className="sheet__header">
          <h2>Combat Drill</h2>
          <button className="sheet__close" onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>

        <section>
          <h3>Your force</h3>
          <p className="building-option__hint">{armyLabel(attackerGarrison, attackerRosterById)}</p>
        </section>

        <section>
          <h3>Sparring partner</h3>
          <ul className="building-list">
            {opponentRoster.map((unit) => (
              <li key={unit.id} className="garrison-row">
                <span className="garrison-row__name">{unit.name}</span>
                <span className="garrison-row__counts">{opponent[unit.id] ?? 0} troops</span>
                <div className="garrison-row__actions">
                  <button onClick={() => adjustOpponent(unit.id, -1)}>-1</button>
                  <button onClick={() => adjustOpponent(unit.id, 1)}>+1</button>
                </div>
              </li>
            ))}
          </ul>
        </section>

        <section>
          <h3>Odds ({odds.trials}-battle estimate)</h3>
          <p className="building-option__hint">
            You win {Math.round(odds.attackerWinProbability * 100)}% · Opponent wins{' '}
            {Math.round(odds.defenderWinProbability * 100)}% · Draw{' '}
            {Math.round(odds.drawProbability * 100)}%
          </p>
          <button className="primary" onClick={autoResolve}>
            Auto-Resolve
          </button>
        </section>

        {result && (
          <section>
            <h3>Battle report</h3>
            <ul className="building-list">
              {result.log.slice(0, revealedRounds).map((round) => (
                <li key={round.round} className="garrison-row">
                  <span className="garrison-row__name">Round {round.round}</span>
                  <span className="garrison-row__counts">
                    You dealt {round.attackerDamageDealt} dmg ({round.defenderRemaining} troops
                    left) · Took {round.defenderDamageDealt} dmg ({round.attackerRemaining} troops
                    left)
                  </span>
                </li>
              ))}
            </ul>
            {revealedRounds >= result.log.length && (
              <p className="building-option__hint">
                {result.winner === 'attacker'
                  ? 'Victory.'
                  : result.winner === 'defender'
                    ? 'Defeat.'
                    : 'Draw — both sides withdrew.'}{' '}
                Losses: {armyLabel(result.attackerLosses, attackerRosterById)}
              </p>
            )}
          </section>
        )}
      </div>
    </div>
  )
}
