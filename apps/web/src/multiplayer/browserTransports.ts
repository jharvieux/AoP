import type { ChatPokeTransport } from './chatSync'
import type { TurnPokeTransport } from './turnSync'
import type { ChannelConnectionStatus, ResyncTransport } from './reconnectSync'

/**
 * The concrete browser-signal half of `ResyncTransport` (#243): network
 * online/offline and tab visibility/focus return, straight off `window` /
 * `document`. The third signal — Realtime channel status — has no concrete
 * transport in this client yet (TODO(#260): @supabase/realtime-js adapter,
 * blocked on a runtime-dependency decision), so `onChannelStatusChange` never
 * fires; `subscribeReconnectSync` treats a never-connecting channel correctly
 * (its first-connect suppression simply never arms).
 */
export function browserResyncTransport(): ResyncTransport {
  return {
    onChannelStatusChange(_handler: (status: ChannelConnectionStatus) => void): () => void {
      return () => {}
    },
    onNetworkStatusChange(handler: (online: boolean) => void): () => void {
      const onOnline = () => handler(true)
      const onOffline = () => handler(false)
      window.addEventListener('online', onOnline)
      window.addEventListener('offline', onOffline)
      return () => {
        window.removeEventListener('online', onOnline)
        window.removeEventListener('offline', onOffline)
      }
    },
    onVisibilityReturn(handler: () => void): () => void {
      const onVisibility = () => {
        if (document.visibilityState === 'visible') handler()
      }
      document.addEventListener('visibilitychange', onVisibility)
      window.addEventListener('focus', handler)
      return () => {
        document.removeEventListener('visibilitychange', onVisibility)
        window.removeEventListener('focus', handler)
      }
    },
  }
}

/**
 * A poke transport that never delivers a poke — the stand-in wired where
 * `turnSync`/`chatSync` expect the Realtime channel until the concrete
 * transport lands (TODO(#260)). The match screen compensates by polling
 * `get-player-view` on an interval (the SpectateScreen pattern) and eagerly
 * refetching chat after its own sends, so nothing blocks on this; a real
 * transport drops in here without touching the sync modules.
 */
export const noPokeTransport: TurnPokeTransport & ChatPokeTransport = {
  subscribe(_channel: string, _onPoke: (payload: unknown) => void): () => void {
    return () => {}
  },
}
