import { RealtimeClient } from '@supabase/realtime-js'
import type { SupabaseConfig } from '../auth/supabaseAuth'
import type { ChatPokeTransport } from './chatSync'
import type { ChannelConnectionStatus } from './reconnectSync'
import type { TurnPokeTransport } from './turnSync'

/**
 * The concrete Supabase Realtime adapter (#260) behind the DI seams the
 * headless sync modules were built against: `TurnPokeTransport` /
 * `ChatPokeTransport` (`subscribe`) and the channel-status half of
 * `ResyncTransport` (`onChannelStatusChange`). One websocket, one
 * `match:{id}` channel shared by every subscriber.
 *
 * The channel is joined with `config.private = true` — mandatory since #228:
 * RLS on `realtime.messages` admits only the match's participants and granted
 * spectators as listeners, and a public join of a private channel is refused
 * outright. There is no client send path at all (no INSERT policy exists);
 * pokes only ever arrive from the service-role Edge Functions, and even those
 * are re-validated by `turnSync`/`chatSync` before triggering a refetch.
 */

/** The slice of `RealtimeChannel` this adapter touches — fakeable in tests. */
export interface RealtimeChannelLike {
  on(
    type: 'broadcast',
    filter: { event: string },
    callback: (message: { event: string; payload?: unknown }) => void,
  ): unknown
  subscribe(callback?: (status: string, err?: Error) => void): unknown
  unsubscribe(): Promise<string>
}

/** The slice of `RealtimeClient` this adapter touches — fakeable in tests. */
export interface RealtimeClientLike {
  channel(topic: string, options: { config: { private: boolean } }): RealtimeChannelLike
  setAuth(token?: string | null): Promise<void>
  disconnect(): void
}

export interface MatchRealtimeTransport extends TurnPokeTransport, ChatPokeTransport {
  /**
   * Channel connection transitions, normalized for `ResyncTransport`:
   * `SUBSCRIBED` → `'connected'`; an error, timeout, or close →
   * `'disconnected'`. `subscribeReconnectSync` turns a
   * disconnected→connected transition into a wholesale view refetch, which
   * covers any pokes the drop swallowed.
   */
  onChannelStatusChange(handler: (status: ChannelConnectionStatus) => void): () => void
  /** Swap the JWT after a session refresh so rejoins keep passing RLS. */
  setAuth(accessToken: string): void
  /** Tear down every channel and the websocket. The transport is dead after this. */
  dispose(): void
}

interface ChannelEntry {
  channel: RealtimeChannelLike
  pokeHandlers: Set<(payload: unknown) => void>
}

/**
 * Build the production `RealtimeClient` for a Supabase project. Split from
 * {@link createMatchRealtimeTransport} so tests can inject a fake client and
 * never open a socket.
 */
export function supabaseRealtimeClient(config: SupabaseConfig): RealtimeClientLike {
  // Same endpoint derivation supabase-js uses: project URL → realtime host.
  const endpoint = `${config.url.replace(/^http/i, 'ws')}/realtime/v1`
  return new RealtimeClient(endpoint, { params: { apikey: config.anonKey } })
}

export function createMatchRealtimeTransport(
  client: RealtimeClientLike,
  accessToken: string,
): MatchRealtimeTransport {
  // Authorize before any join: private-channel joins are checked against this
  // JWT by the #228 RLS policy. realtime-js records the token synchronously;
  // the promise only covers re-pushing it to already-joined channels.
  void client.setAuth(accessToken)

  const entries = new Map<string, ChannelEntry>()
  const statusHandlers = new Set<(status: ChannelConnectionStatus) => void>()
  let disposed = false

  function joinChannel(topic: string): ChannelEntry {
    const entry: ChannelEntry = {
      channel: client.channel(topic, { config: { private: true } }),
      pokeHandlers: new Set(),
    }
    const forward = (message: { event: string; payload?: unknown }) => {
      // Fan the raw payload out to every subscriber; turnSync/chatSync each
      // validate and ignore what isn't theirs.
      for (const handler of entry.pokeHandlers) handler(message.payload)
    }
    entry.channel.on('broadcast', { event: 'turn' }, forward)
    entry.channel.on('broadcast', { event: 'chat' }, forward)
    entry.channel.subscribe((status) => {
      for (const handler of statusHandlers) {
        handler(status === 'SUBSCRIBED' ? 'connected' : 'disconnected')
      }
    })
    entries.set(topic, entry)
    return entry
  }

  return {
    subscribe(topic: string, onPoke: (payload: unknown) => void): () => void {
      if (disposed) return () => {}
      const entry = entries.get(topic) ?? joinChannel(topic)
      entry.pokeHandlers.add(onPoke)
      return () => {
        entry.pokeHandlers.delete(onPoke)
        // Last listener gone: leave the channel. A later subscribe re-joins
        // with a fresh channel object (realtime-js channels are single-use).
        if (entry.pokeHandlers.size === 0 && entries.get(topic) === entry) {
          entries.delete(topic)
          void entry.channel.unsubscribe()
        }
      }
    },

    onChannelStatusChange(handler: (status: ChannelConnectionStatus) => void): () => void {
      statusHandlers.add(handler)
      return () => {
        statusHandlers.delete(handler)
      }
    },

    setAuth(token: string): void {
      void client.setAuth(token)
    },

    dispose(): void {
      disposed = true
      for (const entry of entries.values()) void entry.channel.unsubscribe()
      entries.clear()
      statusHandlers.clear()
      client.disconnect()
    },
  }
}
