import type { Action, BattleReport, EncounterOutcome, PlayerView } from '@aop/engine'
import { isSeqConflict } from '@aop/shared'
import type { SupabaseConfig } from '../auth/supabaseAuth'
import type { AuthSession } from '../auth/types'

/**
 * A `submit-action` failure. `code` mirrors the server's `ErrorCode` when the
 * response carried the `{ error: { code, message } }` envelope. The two codes
 * a match screen must branch on:
 *
 *  - `SEQ_CONFLICT` (§9 step 3): the local view is stale — discard it and
 *    refetch `get-player-view` wholesale. Also exposed as {@link isStale}.
 *  - `NOT_YOUR_TURN`: same reaction (a sweep skip or another tab acted).
 *
 * Everything else (`INVALID_ACTION`, `MATCH_STATE`, network) is surfaced to
 * the player as-is.
 */
export class MatchActionError extends Error {
  constructor(
    message: string,
    readonly code?: string,
  ) {
    super(message)
    this.name = 'MatchActionError'
  }

  /** True when the correct reaction is a full view refetch, not a user-facing error. */
  get isStale(): boolean {
    return this.code === 'SEQ_CONFLICT' || this.code === 'NOT_YOUR_TURN'
  }
}

/** One accepted `submit-action` response: the new authoritative sequence and
 * the caller's refreshed fog-locked view (docs/MULTIPLAYER.md §5.4).
 * `battleReport` is present only when the action was an attack (#285);
 * `encounterOutcome` only when it resolved a sea/land encounter (#502) —
 * both are the caller's own outcome, never another seat's. */
export interface SubmitActionResult {
  seq: number
  view: PlayerView
  battleReport?: BattleReport
  encounterOutcome?: EncounterOutcome
}

/**
 * Client for the `submit-action` Edge Function — the single write path a
 * multiplayer client has (§5.4). Plain `fetch`, matching every other
 * multiplayer client module here (see `spectateClient.ts`); `expectedSeq` is
 * the optimistic-concurrency token from the last `get-player-view` /
 * `submit-action` response.
 */
export class MatchActionClient {
  private readonly url: string
  private readonly anonKey: string
  private readonly fetchImpl: typeof fetch

  constructor(config: SupabaseConfig, fetchImpl: typeof fetch = fetch) {
    this.url = config.url.replace(/\/$/, '')
    this.anonKey = config.anonKey
    this.fetchImpl = fetchImpl
  }

  async submitAction(
    session: AuthSession,
    params: { matchId: string; expectedSeq: number; action: Action },
  ): Promise<SubmitActionResult> {
    let res: Response
    try {
      res = await this.fetchImpl(`${this.url}/functions/v1/submit-action`, {
        method: 'POST',
        headers: {
          apikey: this.anonKey,
          Authorization: `Bearer ${session.accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(params),
      })
    } catch {
      throw new MatchActionError('Could not reach the server. Check your connection.')
    }

    const json = (await res.json().catch(() => ({}))) as {
      error?: { code?: string; message?: string }
    }
    if (!res.ok) {
      // isSeqConflict is the shared §9 detector; the envelope's own code field
      // covers every other error uniformly.
      const code = isSeqConflict(json) ? 'SEQ_CONFLICT' : json.error?.code
      throw new MatchActionError(json.error?.message ?? `Request failed (${res.status}).`, code)
    }
    return json as unknown as SubmitActionResult
  }
}
