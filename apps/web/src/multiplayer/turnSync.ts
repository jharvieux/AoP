import { isTurnBroadcast } from '@aop/shared'

/**
 * Realtime turn-advance sync (docs/MULTIPLAYER.md §9, issue #131). When the
 * server pokes `match:{id}` with `{ type: 'turn', seq }` after a turn advances
 * (§6), the client refetches its own `get-player-view` — the poke itself is
 * never a source of state (§7 leak-audit), only a nudge to resync.
 *
 * No match-screen UI exists yet, so this is a headless, dependency-injected
 * module: the caller supplies the Realtime transport and the refetch callback.
 * That keeps it unit-testable without a live websocket and lets whoever builds
 * the match screen plug in the concrete Supabase Realtime channel unchanged.
 */

/** The Realtime transport a match screen wires up (Supabase Realtime, or a fake in tests). */
export interface TurnPokeTransport {
  /**
   * Subscribe to broadcast pokes on `channel` (e.g. `match:{id}`). `onPoke`
   * receives the raw, untrusted payload. Returns an unsubscribe function.
   */
  subscribe(channel: string, onPoke: (payload: unknown) => void): () => void
}

export interface TurnSyncOptions {
  matchId: string
  transport: TurnPokeTransport
  /**
   * Refetch the player's view (§9 step 4). Called with the poke's `seq` so a
   * caller can log/track it; the authoritative sequence still comes from the
   * `get-player-view` response, never from the poke.
   */
  onTurn: (seq: number) => void | Promise<void>
}

/**
 * Subscribe to a match's turn pokes and drive a view refetch on each one.
 * Returns an unsubscribe function. Malformed or non-turn payloads are ignored
 * (they can never trigger a refetch), and pokes are filtered to strictly
 * increasing `seq` so a duplicate or late poke doesn't cause a redundant
 * refetch — missing a poke is harmless since any refetch fully resyncs (§9).
 */
export function subscribeTurnSync(options: TurnSyncOptions): () => void {
  const { matchId, transport, onTurn } = options
  let latestSeq = -1
  return transport.subscribe(`match:${matchId}`, (payload) => {
    if (!isTurnBroadcast(payload)) return
    if (payload.seq <= latestSeq) return
    latestSeq = payload.seq
    void onTurn(payload.seq)
  })
}
