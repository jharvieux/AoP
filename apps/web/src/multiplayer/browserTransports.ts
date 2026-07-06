import type { ChannelConnectionStatus, ResyncTransport } from './reconnectSync'

/**
 * The browser-signal half of `ResyncTransport` (#243): network online/offline
 * and tab visibility/focus return, straight off `window` / `document`. The
 * third signal — Realtime channel status — comes from the match's
 * `realtimeTransport.ts` adapter (#260); the match screen spreads this
 * transport and overrides `onChannelStatusChange` with it, so the stub here
 * never fires (`subscribeReconnectSync` treats a never-connecting channel
 * correctly — its first-connect suppression simply never arms).
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
