import type { ChatChannel } from '@aop/shared'
import type { SupabaseConfig } from '../auth/supabaseAuth'
import type { AuthSession } from '../auth/types'

export class ChatError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ChatError'
  }
}

/** A `match_chat` row as PostgREST returns it, camelCased for the client. */
export interface ChatMessage {
  id: number
  seat: number
  channel: ChatChannel
  body: string
  createdAt: string
}

interface ChatRow {
  id: number
  seat: number
  channel: ChatChannel
  body: string
  created_at: string
}

/**
 * Reads and writes a match's chat (#139/#140/#141). Mirrors `MatchReplayClient`
 * and `SupabaseAuthBackend`: no `@supabase/supabase-js` dependency, a small
 * `fetch`-based surface, `fetch` injected so every flow is unit-testable
 * without a live project.
 *
 * Reads go straight to PostgREST — RLS already scopes an `alliance` channel
 * read to the caller's *current* alliance cluster
 * (supabase/migrations/20260705000002_match_chat.sql), so this client applies
 * no extra filtering beyond the channel itself. Writes go through the
 * `send-chat` Edge Function (supabase/functions/send-chat/index.ts): the
 * caller's seat is derived from the JWT there, never sent in the body.
 */
export class ChatClient {
  private readonly url: string
  private readonly anonKey: string
  private readonly fetchImpl: typeof fetch

  constructor(config: SupabaseConfig, fetchImpl: typeof fetch = fetch) {
    this.url = config.url.replace(/\/$/, '')
    this.anonKey = config.anonKey
    this.fetchImpl = fetchImpl
  }

  /** Post one message; returns the new row id. Throws {@link ChatError} on rejection (rate limit, not in an alliance, match not active, ...). */
  async send(
    session: AuthSession,
    matchId: string,
    channel: ChatChannel,
    body: string,
  ): Promise<number> {
    let res: Response
    try {
      res = await this.fetchImpl(`${this.url}/functions/v1/send-chat`, {
        method: 'POST',
        headers: {
          apikey: this.anonKey,
          Authorization: `Bearer ${session.accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ matchId, channel, body }),
      })
    } catch {
      throw new ChatError('Could not reach the server. Check your connection.')
    }

    const parsed = (await res.json().catch(() => ({}))) as {
      id?: number
      error?: { message?: string }
    }
    if (!res.ok || typeof parsed.id !== 'number') {
      throw new ChatError(parsed.error?.message ?? 'Could not send the message.')
    }
    return parsed.id
  }

  /**
   * Fetch a channel's visible messages in send order. Pass `afterId` (the
   * highest id already held) to fetch only what's new since the last poke —
   * omit it for the initial load of a channel.
   */
  async fetchMessages(
    session: AuthSession,
    matchId: string,
    channel: ChatChannel,
    afterId?: number,
  ): Promise<ChatMessage[]> {
    const params = new URLSearchParams({
      match_id: `eq.${matchId}`,
      channel: `eq.${channel}`,
      select: 'id,seat,channel,body,created_at',
      order: 'id.asc',
    })
    if (afterId !== undefined) params.set('id', `gt.${afterId}`)

    let res: Response
    try {
      res = await this.fetchImpl(`${this.url}/rest/v1/match_chat?${params.toString()}`, {
        headers: {
          apikey: this.anonKey,
          Authorization: `Bearer ${session.accessToken}`,
        },
      })
    } catch {
      throw new ChatError('Could not reach the server. Check your connection.')
    }
    if (!res.ok) throw new ChatError(`Could not load chat (${res.status}).`)

    const rows = (await res.json().catch(() => [])) as unknown
    if (!Array.isArray(rows)) return []
    return (rows as ChatRow[]).map((r) => ({
      id: r.id,
      seat: r.seat,
      channel: r.channel,
      body: r.body,
      createdAt: r.created_at,
    }))
  }
}
