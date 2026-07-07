import { TACTICS, type TacticContext, type TacticId } from '@aop/engine'
import { tapFeedback } from './audio/feedback'

/**
 * Interactive naval-tactics round sheet (#305): the player's half of the
 * gunnery duel, one round at a time. `ctx` is the engine's own
 * `TacticContext` from the live probe ({@link probeTacticalBattle} in
 * `boardingPlanner.ts`) — the same numbers `resolveTacticalCombat` itself
 * uses to run the round, so nothing shown here is a guess. Picking a tactic
 * re-probes for the next round (or hands off to the boarding command sheet,
 * or dispatches the resolved battle) — see `GameScreen.tsx`'s `chooseTactic`.
 */

const TACTIC_LABEL: Record<TacticId, string> = {
  broadside: 'Broadside',
  board: 'Board',
  ram: 'Ram',
  evade: 'Evade',
}

const TACTIC_HINT: Record<TacticId, string> = {
  broadside: 'Trade cannon fire — the safe default.',
  board: 'Grapple and storm their deck — decides the battle if it lands.',
  ram: 'Drive the bow in — punishes a boarder, but eats a broadside.',
  evade: 'Try to break off the fight and disengage.',
}

interface TacticalRoundSheetProps {
  ctx: TacticContext
  onChoose: (tactic: TacticId) => void
  onAutoResolve: () => void
}

export function TacticalRoundSheet({ ctx, onChoose, onAutoResolve }: TacticalRoundSheetProps) {
  function choose(tactic: TacticId) {
    tapFeedback()
    onChoose(tactic)
  }

  return (
    <div className="sheet-backdrop">
      <div className="sheet battle-sheet" onClick={(e) => e.stopPropagation()}>
        <div className="sheet__header">
          <h2>Naval tactics — round {ctx.round}</h2>
        </div>

        <section>
          <p className="building-option__hint">
            Your fleet: {Math.round(ctx.ownHp)} hp, {Math.round(ctx.ownStrength)} strength, speed{' '}
            {ctx.ownSpeed}. Enemy: {Math.round(ctx.enemyHp)} hp, {Math.round(ctx.enemyStrength)}{' '}
            strength, speed {ctx.enemySpeed}.
            {ctx.enemyLastTactic
              ? ` They played ${TACTIC_LABEL[ctx.enemyLastTactic]} last round.`
              : ''}
          </p>
        </section>

        <section className="tactic-choices">
          {TACTICS.filter((t) => ctx.available.includes(t)).map((tactic) => (
            <button key={tactic} className="secondary tactic-choice" onClick={() => choose(tactic)}>
              <span className="tactic-choice__label">{TACTIC_LABEL[tactic]}</span>
              <span className="tactic-choice__hint">{TACTIC_HINT[tactic]}</span>
            </button>
          ))}
        </section>

        <button className="secondary boarding-auto" onClick={onAutoResolve}>
          Let the AI fight the whole battle (auto-resolve)
        </button>
      </div>
    </div>
  )
}
