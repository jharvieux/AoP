export function supabaseRealtimeClient() {
  return {}
}

export function createMatchRealtimeTransport() {
  return {
    subscribe: () => () => undefined,
    onChannelStatusChange: () => () => undefined,
    setAuth: () => undefined,
    dispose: () => undefined,
  }
}

export type MatchRealtimeTransport = ReturnType<typeof createMatchRealtimeTransport>
