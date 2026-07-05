import type { PlayerView } from '@aop/engine'
import type { SupabaseConfig } from '../auth/supabaseAuth'
import type { AuthSession } from '../auth/types'

/**
 * A failure surfaced by either Edge Function this module calls. `code` mirrors
 * the server's `ErrorCode` (`supabase/functions/_shared/http.ts`) when the
 * response carried the `{ error: { code, message } }` envelope — e.g.
 * `FORBIDDEN` for "you were never granted a spectator seat here", `MATCH_STATE`
 * for "match hasn't started". `undefined` means the failure never reached that
 * envelope (network error, non-JSON body, …).
 */
export class SpectateError extends Error {
  constructor(
    message: string,
    readonly code?: string,
  ) {
    super(message)
    this.name = 'SpectateError'
  }
}

/** One `get-player-view` response — the live, fog-locked read a granted
 * spectator (or a real seat-holder) polls (docs/MULTIPLAYER.md §12). */
export interface SpectateView {
  seq: number
  seat: number
  role: 'player' | 'spectator'
  view: PlayerView
  turnDeadline: string | null
}

/**
 * Client for the two Edge Functions #148/#149's live-spectate feature turns
 * on: `designate-spectator` (a match creator granting access) and
 * `get-player-view` (the granted spectator's read of that seat's live,
 * fog-locked state). Plain `fetch`, matching every other multiplayer client
 * module in this app (see auth/supabaseAuth.ts) — no `@supabase/supabase-js`
 * dependency, and an injectable `fetchImpl` keeps both calls unit-testable
 * without a live project.
 */
export class SpectateClient {
  private readonly url: string
  private readonly anonKey: string
  private readonly fetchImpl: typeof fetch

  constructor(config: SupabaseConfig, fetchImpl: typeof fetch = fetch) {
    this.url = config.url.replace(/\/$/, '')
    this.anonKey = config.anonKey
    this.fetchImpl = fetchImpl
  }

  /**
   * Grant `userId` spectator access to `matchId`, pinned to `seat` (§12: only
   * the match creator's own token may succeed here — enforced server-side, not
   * by anything this client checks). Resolves with nothing on success; throws
   * `SpectateError` otherwise (e.g. `FORBIDDEN` if the caller isn't the
   * creator, `BAD_REQUEST` for an unknown seat, `NOT_FOUND` for an unknown
   * user).
   */
  async designateSpectator(
    session: AuthSession,
    params: { matchId: string; userId: string; seat: number },
  ): Promise<void> {
    await this.post('designate-spectator', session, params)
  }

  /**
   * Fetch the caller's current live view of `matchId`: their own seat if they
   * hold one, or the pinned seat of a spectator grant otherwise (§12). Throws
   * `SpectateError` with code `FORBIDDEN` if the caller holds neither.
   */
  async getPlayerView(session: AuthSession, matchId: string): Promise<SpectateView> {
    return this.post<SpectateView>('get-player-view', session, { matchId })
  }

  private async post<T>(fn: string, session: AuthSession, body: unknown): Promise<T> {
    let res: Response
    try {
      res = await this.fetchImpl(`${this.url}/functions/v1/${fn}`, {
        method: 'POST',
        headers: {
          apikey: this.anonKey,
          Authorization: `Bearer ${session.accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      })
    } catch {
      throw new SpectateError('Could not reach the server. Check your connection.')
    }

    const json = (await res.json().catch(() => ({}))) as {
      error?: { code?: string; message?: string }
    }
    if (!res.ok) {
      throw new SpectateError(
        json.error?.message ?? `Request failed (${res.status}).`,
        json.error?.code,
      )
    }
    return json as T
  }
}
