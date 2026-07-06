import type { MapSize } from '@aop/shared'
import type { SupabaseConfig } from '../auth/supabaseAuth'
import type { AuthSession } from '../auth/types'

/** A failure joining/leaving/reading the quick-match queue, or reading the
 * caller's seated matches. `status` is the HTTP status when the failure came
 * from a non-ok response; `undefined` means it never got that far (network
 * error, non-JSON response, …). */
export class MatchmakingQueueError extends Error {
  readonly status: number | undefined

  constructor(message: string, status?: number) {
    super(message)
    this.name = 'MatchmakingQueueError'
    this.status = status
  }
}

/**
 * Whether a queue-client failure is permanent — a 4xx (expired/invalid auth,
 * forbidden, not found, bad request) that retrying the same request won't
 * fix — versus transient (network blip, 5xx) worth silently retrying on the
 * next poll tick (#239: a poll loop that swallows every failure the same way
 * leaves an expired-token player watching "Searching…" forever).
 */
export function isPermanentQueueError(error: unknown): boolean {
  return (
    error instanceof MatchmakingQueueError &&
    error.status !== undefined &&
    error.status >= 400 &&
    error.status < 500
  )
}

/** What a quick-match search asks for: desired human player count and map
 * size (the `matchmaking_queue` bucket key, see the migration), plus an
 * optional faction preference honored on seating when free. */
export interface QuickMatchRequest {
  matchSize: number
  mapSize: MapSize
  faction?: string | null
}

/** The caller's own `matchmaking_queue` row, or `null` when not queued. */
export interface QueueEntryStatus {
  matchSize: number
  mapSize: MapSize
  faction: string | null
  queuedAt: string
}

interface QueueRow {
  match_size: number
  map_size: MapSize
  faction: string | null
  queued_at: string
}

/**
 * Client for the quick-match queue (#153). Unlike every other multiplayer
 * write in this app, joining/leaving the queue is NOT an Edge Function call:
 * per the migration (`supabase/migrations/20260706000000_matchmaking_queue.sql`),
 * `matchmaking_queue` is RLS-scoped so a client may insert/delete only its own
 * row directly against PostgREST — "the client inserts to join the queue and
 * deletes to leave it... no Edge Function is needed to enqueue." This module
 * is the plain-`fetch` PostgREST wrapper for that, mirroring `ChatClient`'s
 * `fetchMessages` (direct REST read) alongside its Edge-Function `send`.
 *
 * `mySeatedMatchIds` reads `match_players` the same way (RLS already scopes it
 * to the caller's own seated matches) — the "quick-match found" detection this
 * client enables is a before/after diff of that set, never a poll of game state.
 */
export class MatchmakingQueueClient {
  private readonly url: string
  private readonly anonKey: string
  private readonly fetchImpl: typeof fetch

  constructor(config: SupabaseConfig, fetchImpl: typeof fetch = fetch) {
    this.url = config.url.replace(/\/$/, '')
    this.anonKey = config.anonKey
    this.fetchImpl = fetchImpl
  }

  /** Join the queue (or update the caller's existing entry's criteria) — an
   * upsert on the `user_id` primary key, since re-searching with different
   * criteria while already queued should replace the old entry, not conflict. */
  async join(session: AuthSession, request: QuickMatchRequest): Promise<void> {
    let res: Response
    try {
      res = await this.fetchImpl(`${this.url}/rest/v1/matchmaking_queue`, {
        method: 'POST',
        headers: {
          apikey: this.anonKey,
          Authorization: `Bearer ${session.accessToken}`,
          'Content-Type': 'application/json',
          Prefer: 'resolution=merge-duplicates',
        },
        body: JSON.stringify({
          user_id: session.user.id,
          match_size: request.matchSize,
          map_size: request.mapSize,
          faction: request.faction ?? null,
        }),
      })
    } catch {
      throw new MatchmakingQueueError('Could not reach the server. Check your connection.')
    }
    if (!res.ok)
      throw new MatchmakingQueueError(`Could not join the queue (${res.status}).`, res.status)
  }

  /** Leave the queue: delete the caller's own row. A no-op (not an error) if
   * the caller was already matched or never queued. */
  async leave(session: AuthSession): Promise<void> {
    let res: Response
    try {
      res = await this.fetchImpl(
        `${this.url}/rest/v1/matchmaking_queue?user_id=eq.${encodeURIComponent(session.user.id)}`,
        {
          method: 'DELETE',
          headers: {
            apikey: this.anonKey,
            Authorization: `Bearer ${session.accessToken}`,
          },
        },
      )
    } catch {
      throw new MatchmakingQueueError('Could not reach the server. Check your connection.')
    }
    if (!res.ok)
      throw new MatchmakingQueueError(`Could not leave the queue (${res.status}).`, res.status)
  }

  /** The caller's own queue entry, or `null` once it's been drained (or was never joined). */
  async myStatus(session: AuthSession): Promise<QueueEntryStatus | null> {
    const rows = await this.getJson<QueueRow[]>(
      session,
      `matchmaking_queue?user_id=eq.${encodeURIComponent(session.user.id)}` +
        `&select=match_size,map_size,faction,queued_at`,
    )
    const row = rows[0]
    if (!row) return null
    return {
      matchSize: row.match_size,
      mapSize: row.map_size,
      faction: row.faction,
      queuedAt: row.queued_at,
    }
  }

  /** Every match id the caller currently holds a seat in. Used to detect a
   * newly-formed quick match: a fresh id in this set once `myStatus` goes
   * back to `null` is the match the drain just seated the caller into. */
  async mySeatedMatchIds(session: AuthSession): Promise<string[]> {
    const rows = await this.getJson<{ match_id: string }[]>(
      session,
      `match_players?user_id=eq.${encodeURIComponent(session.user.id)}&select=match_id`,
    )
    return rows.map((r) => r.match_id)
  }

  private async getJson<T>(session: AuthSession, path: string): Promise<T> {
    let res: Response
    try {
      res = await this.fetchImpl(`${this.url}/rest/v1/${path}`, {
        headers: {
          apikey: this.anonKey,
          Authorization: `Bearer ${session.accessToken}`,
        },
      })
    } catch {
      throw new MatchmakingQueueError('Could not reach the server. Check your connection.')
    }
    if (!res.ok) throw new MatchmakingQueueError(`Request failed (${res.status}).`, res.status)
    return (await res.json().catch(() => [])) as T
  }
}
