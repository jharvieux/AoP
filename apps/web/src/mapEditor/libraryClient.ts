import type { CommunityMapSummary } from '@aop/shared'
import type { SupabaseConfig } from '../auth/supabaseAuth'
import type { AuthSession } from '../auth/types'

export type { CommunityMapSummary }

/**
 * A failure surfaced by the community-library Edge Functions. `code` mirrors
 * the server's `ErrorCode` (`supabase/functions/_shared/http.ts`) when the
 * response carried the `{ error: { code, message } }` envelope — e.g.
 * `RATE_LIMITED` for the publish throttle or `FORBIDDEN` for a guest publish.
 * `undefined` means the failure never reached that envelope (network error,
 * non-JSON body, …).
 */
export class CommunityLibraryError extends Error {
  constructor(
    message: string,
    readonly code?: string,
  ) {
    super(message)
    this.name = 'CommunityLibraryError'
  }
}

/** One page of the library browser, as `browse-maps` returns it. */
export interface CommunityMapPage {
  maps: CommunityMapSummary[]
  /** Keyset cursor for the next page, or `null` when this page was short (end of the list). */
  nextBefore: string | null
}

/** A downloaded map, as `download-map` returns it — `mapCode` feeds the same
 * decode + engine-validate import path as a hand-pasted Tier-1 code. */
export interface DownloadedCommunityMap {
  mapId: string
  name: string
  mapCode: string
  authorId: string
  authorName: string
  width: number
  height: number
  playerCount: number
}

/**
 * Client for the community map library Edge Functions (#63 Tier 2):
 * publish/browse/download/report/remove. Plain `fetch`, matching
 * `OpenMatchesClient`/`LeaderboardClient` — injectable `fetchImpl` keeps every
 * call unit-testable without a live project. All policy (validation, size
 * caps, rate limits, moderation) is server-side; this module only transports.
 */
export class CommunityLibraryClient {
  private readonly url: string
  private readonly anonKey: string
  private readonly fetchImpl: typeof fetch

  constructor(config: SupabaseConfig, fetchImpl: typeof fetch = fetch) {
    this.url = config.url.replace(/\/$/, '')
    this.anonKey = config.anonKey
    this.fetchImpl = fetchImpl
  }

  /** Publish a Tier-1 map code to the library. Registered accounts only —
   * the server re-validates the map and enforces the publish rate limit. */
  async publish(
    session: AuthSession,
    params: { mapCode: string; name?: string },
  ): Promise<{ mapId: string }> {
    return this.post('publish-map', session, params)
  }

  /** Fetch one page of published maps, optionally filtered by a name search.
   * Pass `before` (the previous page's `nextBefore`) to continue paging. */
  async browse(
    session: AuthSession,
    params: { search?: string; limit?: number; before?: string | null } = {},
  ): Promise<CommunityMapPage> {
    const page = await this.post<Partial<CommunityMapPage>>('browse-maps', session, {
      search: params.search,
      limit: params.limit,
      before: params.before ?? undefined,
    })
    return { maps: page.maps ?? [], nextBefore: page.nextBefore ?? null }
  }

  /** Download a map's code (the server counts the download). */
  async download(session: AuthSession, mapId: string): Promise<DownloadedCommunityMap> {
    return this.post('download-map', session, { mapId })
  }

  /** Report a map for review; auto-hides server-side at the report threshold. */
  async report(
    session: AuthSession,
    mapId: string,
    reason?: string,
  ): Promise<{ status: string; reportCount: number }> {
    return this.post('report-map', session, { mapId, reason })
  }

  /** Remove (soft-delete) the caller's own map from the library. */
  async remove(session: AuthSession, mapId: string): Promise<{ removed: boolean }> {
    return this.post('remove-map', session, { mapId })
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
      throw new CommunityLibraryError('Could not reach the server. Check your connection.')
    }

    const json = (await res.json().catch(() => ({}))) as T & {
      error?: { code?: string; message?: string }
    }
    if (!res.ok) {
      throw new CommunityLibraryError(
        json.error?.message ?? `Request failed (${res.status}).`,
        json.error?.code,
      )
    }
    return json
  }
}
