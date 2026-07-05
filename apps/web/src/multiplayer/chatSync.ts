import { isChatBroadcast } from '@aop/shared'

/**
 * Realtime chat sync (#139), the chat sibling of turnSync.ts. When the server
 * pokes `match:{id}` with `{ type: 'chat', id }` after a message lands (§6), the
 * client refetches the chat rows RLS lets it see — the poke itself never carries
 * the message body or channel (§7 leak-audit), only a nudge to resync. A seat
 * outside an alliance simply gets no new visible row on refetch.
 *
 * Headless and dependency-injected like turnSync: the caller supplies the
 * Realtime transport and the refetch callback, so it is unit-testable without a
 * live websocket and the match screen can plug in the concrete Supabase channel.
 */

/** The Realtime transport a match screen wires up (Supabase Realtime, or a fake in tests). */
export interface ChatPokeTransport {
  /**
   * Subscribe to broadcast pokes on `channel` (e.g. `match:{id}`). `onPoke`
   * receives the raw, untrusted payload. Returns an unsubscribe function.
   */
  subscribe(channel: string, onPoke: (payload: unknown) => void): () => void
}

export interface ChatSyncOptions {
  matchId: string
  transport: ChatPokeTransport
  /**
   * Refetch the visible chat (§9 resync step). Called with the poke's `id` so a
   * caller can log/track it; the authoritative rows still come from the
   * RLS-guarded SELECT, never from the poke.
   */
  onChat: (id: number) => void | Promise<void>
}

/**
 * Subscribe to a match's chat pokes and drive a chat refetch on each one.
 * Returns an unsubscribe function. Malformed or non-chat payloads are ignored,
 * and pokes are filtered to strictly increasing `id` so a duplicate or late
 * poke doesn't cause a redundant refetch — missing a poke is harmless since any
 * refetch fully resyncs.
 */
export function subscribeChatSync(options: ChatSyncOptions): () => void {
  const { matchId, transport, onChat } = options
  let latestId = -1
  return transport.subscribe(`match:${matchId}`, (payload) => {
    if (!isChatBroadcast(payload)) return
    if (payload.id <= latestId) return
    latestId = payload.id
    void onChat(payload.id)
  })
}
