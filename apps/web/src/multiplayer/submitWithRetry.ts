import type { Action } from '@aop/engine'
import { MatchActionError, type SubmitActionResult } from './matchActionClient'

/**
 * The pieces `submitActionWithRetry` needs from `MatchScreen`, injected so the
 * retry orchestration below is a plain, network-free function to unit test:
 * `submit` posts one `submit-action` call at the given `expectedSeq`, and
 * `refetch` re-fetches the authoritative `{ seq, view }` (or `null` if the
 * seat/match itself is gone — see `SpectateClient`/`MatchScreen.refetch`).
 */
export interface SubmitRetryDeps<View> {
  submit: (expectedSeq: number, action: Action) => Promise<SubmitActionResult>
  refetch: () => Promise<{ seq: number; view: View } | null>
}

export type SubmitRetryOutcome<View> =
  | { kind: 'ok'; result: SubmitActionResult }
  /** A conflict that survived one retry (or a refetch that came back empty —
   * the seat lost the match entirely). The action was dropped; the caller
   * shows a "board changed" notice rather than a hard error. */
  | { kind: 'stale' }
  | { kind: 'error'; error: unknown }

/**
 * Submits `action` at `expectedSeq`; on a stale rejection (`SEQ_CONFLICT` /
 * `NOT_YOUR_TURN`, §9 step 3) refetches the authoritative view and retries
 * the *same* action once against the fresh `seq` before giving up (#285
 * "optimistic local application"). Today a stale rejection just discards the
 * player's action outright and makes them redo the tap; in this
 * poll-driven architecture (no realtime transport yet, #243) a conflict is
 * routinely just another seat's AI auto-play bumping `action_count` between
 * polls, so the original intent is very often still valid — one retry costs
 * nothing and fixes the common case. Any other rejection is returned as-is,
 * never retried (an `INVALID_ACTION` will fail again identically).
 */
export async function submitActionWithRetry<View>(
  deps: SubmitRetryDeps<View>,
  expectedSeq: number,
  action: Action,
): Promise<SubmitRetryOutcome<View>> {
  try {
    return { kind: 'ok', result: await deps.submit(expectedSeq, action) }
  } catch (err) {
    if (!(err instanceof MatchActionError) || !err.isStale) return { kind: 'error', error: err }

    const fresh = await deps.refetch()
    if (!fresh) return { kind: 'stale' }

    try {
      return { kind: 'ok', result: await deps.submit(fresh.seq, action) }
    } catch (retryErr) {
      if (retryErr instanceof MatchActionError && retryErr.isStale) return { kind: 'stale' }
      return { kind: 'error', error: retryErr }
    }
  }
}
