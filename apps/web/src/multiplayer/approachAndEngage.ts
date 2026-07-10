import type { Action, PlayerView } from '@aop/engine'
import type { SubmitActionResult } from './matchActionClient'
import {
  submitActionWithRetry,
  type SubmitRetryDeps,
  type SubmitRetryOutcome,
} from './submitWithRetry'

/**
 * Sequences an approach move followed by a same-turn engage action (#414,
 * finishing #376's multiplayer parity — mirrors `GameScreen`'s
 * `dispatchApproach` + `confirmAttack`). `MatchScreen`'s plain `submit()`
 * closes over the component's `live.seq` at call time; two back-to-back
 * `void submit()` calls (move, then attack) would both race the same
 * pre-move seq, so the attack collides with the move that just changed it.
 * Threading `seq`/`view` explicitly through this function instead — the same
 * discipline `submitActionWithRetry` already uses for one action — keeps
 * every call honest about what it's racing against.
 *
 * `buildFollowUp` sees the *authoritative* view returned by the move (fog or
 * an opposing action during the round trip may have moved, sunk, or hidden
 * the target) and decides fresh whether the follow-up is still legal,
 * returning `null` to abort it. An illegal follow-up is never submitted —
 * the move still lands (or fails) entirely on its own.
 */
export interface ApproachAndEngageDeps<View> extends SubmitRetryDeps<View> {
  /**
   * Given the fresh post-move view — always the concrete `SubmitActionResult.view`
   * a real `submit-action` response carries, independent of `refetch`'s
   * (test-only) `View` type param — build the follow-up action, or `null` to
   * skip it (no longer legal).
   */
  buildFollowUp: (freshView: PlayerView) => Action | null
}

export type ApproachAndEngageOutcome<View> =
  | { kind: 'ok'; move: SubmitActionResult; followUp: SubmitActionResult }
  /** The approach move itself didn't land — see `outcome` for why (stale/error). */
  | { kind: 'moveFailed'; outcome: SubmitRetryOutcome<View> }
  /** The move landed but `buildFollowUp` decided the engage is no longer legal. */
  | { kind: 'followUpSkipped'; move: SubmitActionResult }
  /** The move landed but the follow-up submit itself was rejected. */
  | { kind: 'followUpFailed'; move: SubmitActionResult; outcome: SubmitRetryOutcome<View> }

export async function submitApproachAndEngage<View>(
  deps: ApproachAndEngageDeps<View>,
  startSeq: number,
  moveAction: Action,
): Promise<ApproachAndEngageOutcome<View>> {
  const moveOutcome = await submitActionWithRetry(deps, startSeq, moveAction)
  if (moveOutcome.kind !== 'ok') return { kind: 'moveFailed', outcome: moveOutcome }

  const followUp = deps.buildFollowUp(moveOutcome.result.view)
  if (!followUp) return { kind: 'followUpSkipped', move: moveOutcome.result }

  const followUpOutcome = await submitActionWithRetry(deps, moveOutcome.result.seq, followUp)
  if (followUpOutcome.kind !== 'ok') {
    return { kind: 'followUpFailed', move: moveOutcome.result, outcome: followUpOutcome }
  }
  return { kind: 'ok', move: moveOutcome.result, followUp: followUpOutcome.result }
}
