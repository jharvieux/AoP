import type { LeaderboardEntry } from '@aop/shared'
import type { SupabaseConfig } from '../auth/supabaseAuth'
import type { AuthSession } from '../auth/types'

export type { LeaderboardEntry }

/** A failure surfaced by `get-leaderboard`. `undefined` reason means the
 * failure never reached the `{ error: { code, message } }` envelope (network
 * error, non-JSON body, …). */
export class LeaderboardError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'LeaderboardError'
  }
}

/**
 * Client for `get-leaderboard` (#154): a single always-on, ranked top-N read
 * of `player_ratings`. Plain `fetch`, matching `SpectateClient`/`ChatClient`.
 * There is no server-side keyset cursor here (the endpoint is `{ limit? } ->
 * { entries }`, not paginated the way `list-open-matches` is) — a caller that
 * wants to page through the board fetches one top-N batch and slices it
 * client-side, which is exactly what `LeaderboardScreen` does with the result.
 */
export class LeaderboardClient {
  private readonly url: string
  private readonly anonKey: string
  private readonly fetchImpl: typeof fetch

  constructor(config: SupabaseConfig, fetchImpl: typeof fetch = fetch) {
    this.url = config.url.replace(/\/$/, '')
    this.anonKey = config.anonKey
    this.fetchImpl = fetchImpl
  }

  /** Fetch the top `limit` ranked players (server-clamped to `LEADERBOARD_PAGE_MAX`). */
  async fetchTop(session: AuthSession, limit?: number): Promise<LeaderboardEntry[]> {
    let res: Response
    try {
      res = await this.fetchImpl(`${this.url}/functions/v1/get-leaderboard`, {
        method: 'POST',
        headers: {
          apikey: this.anonKey,
          Authorization: `Bearer ${session.accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ limit }),
      })
    } catch {
      throw new LeaderboardError('Could not reach the server. Check your connection.')
    }

    const json = (await res.json().catch(() => ({}))) as {
      entries?: LeaderboardEntry[]
      error?: { message?: string }
    }
    if (!res.ok) {
      throw new LeaderboardError(json.error?.message ?? `Request failed (${res.status}).`)
    }
    return json.entries ?? []
  }
}
