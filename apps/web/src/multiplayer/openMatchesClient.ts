import type { OpenMatchSummary } from '@aop/shared'
import type { SupabaseConfig } from '../auth/supabaseAuth'
import type { AuthSession } from '../auth/types'

/**
 * A failure surfaced by `list-open-matches` or `join-match`. `code` mirrors
 * the server's `ErrorCode` (`supabase/functions/_shared/http.ts`) when the
 * response carried the `{ error: { code, message } }` envelope — e.g.
 * `MATCH_STATE` for "match is full" or "no longer open". `undefined` means
 * the failure never reached that envelope (network error, non-JSON body, …).
 */
export class OpenMatchesError extends Error {
  constructor(
    message: string,
    readonly code?: string,
  ) {
    super(message)
    this.name = 'OpenMatchesError'
  }
}

/** One page of the public match browser (#150), as `list-open-matches` returns it. */
export interface OpenMatchPage {
  matches: OpenMatchSummary[]
  /** Keyset cursor for the next page, or `null` when this page was short (end of the list). */
  nextBefore: string | null
}

/** The seat a `join-match` call landed the caller in. */
export interface JoinedMatch {
  matchId: string
  seat: number
}

/**
 * Client for the match-browser Edge Functions (#150 `list-open-matches`, and
 * `join-match` for the "Join" action on a browsed lobby). Plain `fetch`,
 * matching `SpectateClient`/`ChatClient` — no `@supabase/supabase-js`
 * dependency, and an injectable `fetchImpl` keeps both calls unit-testable
 * without a live project. This module only calls `join-match`; it never
 * reimplements its seat/faction assignment logic (that stays server-side).
 */
export class OpenMatchesClient {
  private readonly url: string
  private readonly anonKey: string
  private readonly fetchImpl: typeof fetch

  constructor(config: SupabaseConfig, fetchImpl: typeof fetch = fetch) {
    this.url = config.url.replace(/\/$/, '')
    this.anonKey = config.anonKey
    this.fetchImpl = fetchImpl
  }

  /** Fetch one page of open, joinable lobbies. Pass `before` (the previous
   * page's `nextBefore`) to continue paging; omit it for the first page. */
  async listOpenMatches(
    session: AuthSession,
    params: { limit?: number; before?: string | null } = {},
  ): Promise<OpenMatchPage> {
    return this.post<OpenMatchPage>('list-open-matches', session, {
      limit: params.limit,
      before: params.before ?? undefined,
    })
  }

  /** Join a browsed lobby by id, letting the server assign the first free seat/faction. */
  async joinMatch(session: AuthSession, matchId: string): Promise<JoinedMatch> {
    return this.post<JoinedMatch>('join-match', session, { matchId })
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
      throw new OpenMatchesError('Could not reach the server. Check your connection.')
    }

    const json = (await res.json().catch(() => ({}))) as {
      error?: { code?: string; message?: string }
    }
    if (!res.ok) {
      throw new OpenMatchesError(
        json.error?.message ?? `Request failed (${res.status}).`,
        json.error?.code,
      )
    }
    return json as T
  }
}
