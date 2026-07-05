import { isSeqConflict } from '@aop/shared'

/**
 * Reconnect resync (docs/MULTIPLAYER.md §9 steps 3–4 and §13, issue #145). The
 * cached `PlayerView` is treated as stale — and any optimistic state
 * discarded — whenever:
 *
 *  - the Realtime channel reconnects (a drop can mean missed turn pokes),
 *  - the network comes back online,
 *  - the tab regains visibility/focus (a backgrounded tab misses both of the
 *    above), or
 *  - a `submit-action` call comes back `SEQ_CONFLICT` (§9 step 3).
 *
 * In every case the reaction is identical: refetch `get-player-view` and
 * replace the cached view wholesale — never diff-patch (§13, "Views are
 * whole-state-per-fetch, not diffs"). That is why every trigger below invokes
 * `onResync` with no payload: there is nothing for a caller to merge, only a
 * signal to refetch and replace.
 *
 * This composes with `turnSync.ts` (#131) rather than duplicating it: that
 * module already refetches on each turn poke over the same Realtime channel.
 * This module covers the other resync triggers from §9. No match-screen UI
 * exists yet, so — like turnSync — this is a headless, dependency-injected
 * module: the caller supplies the concrete browser/Realtime signals and the
 * refetch callback.
 */

/** Coarse connection state of the Realtime channel — normalized away from Supabase's own status enum. */
export type ChannelConnectionStatus = 'connected' | 'disconnected'

/** The environment signals a match screen wires up to drive a reconnect resync. */
export interface ResyncTransport {
  /**
   * Realtime channel connection status transitions (e.g. mapping Supabase's
   * `channel.subscribe` status callback to `'connected' | 'disconnected'`, or
   * a fake in tests). Returns an unsubscribe function.
   */
  onChannelStatusChange(handler: (status: ChannelConnectionStatus) => void): () => void
  /**
   * Browser network connectivity (`window.addEventListener('online' |
   * 'offline', ...)`, or a fake in tests). Returns an unsubscribe function.
   */
  onNetworkStatusChange(handler: (online: boolean) => void): () => void
  /**
   * Tab visibility/focus return (`document.visibilitychange` to `'visible'`,
   * or `window.addEventListener('focus', ...)`, or a fake in tests). The
   * handler fires only on *return* — going hidden/blurred is not a trigger.
   * Returns an unsubscribe function.
   */
  onVisibilityReturn(handler: () => void): () => void
}

export interface ReconnectSyncOptions {
  transport: ResyncTransport
  /** Discard optimistic state and refetch the whole `PlayerView` (§13: replacement, never a diff patch). */
  onResync: () => void | Promise<void>
}

/**
 * Subscribe to every reconnect-style resync trigger and drive `onResync` on
 * each one. Returns a single unsubscribe function covering all three
 * sources.
 *
 * The very first `'connected'` channel status is not treated as a reconnect
 * — it is the initial subscribe from §9 step 1, which is already followed by
 * the initial `get-player-view` call outside this module. Only a *later*
 * transition back to `'connected'` (after having dropped) counts as a
 * reconnect worth resyncing over.
 */
export function subscribeReconnectSync(options: ReconnectSyncOptions): () => void {
  const { transport, onResync } = options
  let sawInitialConnect = false

  const unsubscribes = [
    transport.onChannelStatusChange((status) => {
      if (status !== 'connected') return
      if (!sawInitialConnect) {
        sawInitialConnect = true
        return
      }
      void onResync()
    }),
    transport.onNetworkStatusChange((online) => {
      if (online) void onResync()
    }),
    transport.onVisibilityReturn(() => {
      void onResync()
    }),
  ]

  return () => {
    for (const unsubscribe of unsubscribes) unsubscribe()
  }
}

/**
 * Apply the §9 step 3 reaction to a `submit-action` (or any Edge Function)
 * response body: if it is a `SEQ_CONFLICT` error, discard optimistic state
 * and refetch via `onResync`. Returns whether the body was a `SEQ_CONFLICT`
 * so a caller can decide whether to also surface/retry the original request.
 */
export function resyncOnSeqConflict(body: unknown, onResync: () => void | Promise<void>): boolean {
  if (!isSeqConflict(body)) return false
  void onResync()
  return true
}
