import {
  applyActionWithOutcome,
  currentPlayer,
  InvalidActionError,
  type Action,
  type ActionOutcome,
  type GameState,
} from '@aop/engine'

export type ActionDispatchResult =
  | { kind: 'applied'; appliedAction: Action; outcome: ActionOutcome }
  | { kind: 'rejected'; message: string }
  | { kind: 'unrecoverable' }

/**
 * Applies a client-proposed action through the engine, with the #240
 * AI-softlock guard: the reducer throws `InvalidActionError` in ~30 places,
 * and an uncaught throw here used to leave `game` unchanged — so if the
 * rejected action came from the AI-turn effect (GameScreen's `setTimeout`
 * loop), its deps never changed and the next AI step never got scheduled,
 * softlocking the game on "AI thinking…" forever. Whichever seat is actually
 * on the clock (per `currentPlayer`, not the rejected action's own claimed
 * `playerId`) decides the response:
 *
 *  - human seat: no state change, the caller shows `message` as a toast.
 *  - AI (or ai_takeover) seat: forces that seat's turn to end instead, so
 *    play continues — this should never actually fire, since `nextAiAction`
 *    always scores against the exact state it's about to act on, but a
 *    scorer/reducer mismatch must never be able to stall the match.
 *
 * Anything that isn't an `InvalidActionError` is rethrown — those are
 * unexpected engine bugs, not the routine "that move isn't legal right now"
 * case this exists to smooth over.
 */
export function dispatchAction(game: GameState, action: Action): ActionDispatchResult {
  try {
    return { kind: 'applied', appliedAction: action, outcome: applyActionWithOutcome(game, action) }
  } catch (err) {
    if (!(err instanceof InvalidActionError)) throw err
    const actor = currentPlayer(game)
    if (!actor.isAI) return { kind: 'rejected', message: err.message }

    const forcedEndTurn: Action = { type: 'endTurn', playerId: actor.id }
    try {
      return {
        kind: 'applied',
        appliedAction: forcedEndTurn,
        outcome: applyActionWithOutcome(game, forcedEndTurn),
      }
    } catch {
      return { kind: 'unrecoverable' }
    }
  }
}
