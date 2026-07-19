import { describe, expect, it, vi } from 'vitest'
import { subscribeChatSync } from './chatSync'
import {
  createMatchRealtimeTransport,
  supabaseRealtimeClient,
  type RealtimeChannelLike,
  type RealtimeClientLike,
} from './realtimeTransport'
import { subscribeTurnSync } from './turnSync'

// supabaseRealtimeClient's whole job is deriving the right constructor args
// for the real `RealtimeClient` (#556: it had no direct coverage — every
// other test in this file injects a fake client and never calls it). Mock
// the module (vi.mock calls are hoisted above the imports above by vitest,
// so the mock factory must not close over a plain top-level const — use
// vi.hoisted) so the assertions below can inspect those args without
// opening a socket.
const { RealtimeClientMock } = vi.hoisted(() => ({ RealtimeClientMock: vi.fn() }))
vi.mock('@supabase/realtime-js', () => ({
  RealtimeClient: RealtimeClientMock,
}))

/**
 * The Realtime adapter contract (#260), against a fake client so no socket
 * opens. The load-bearing assertions are the #228 authorization ones: every
 * channel is joined with `config.private = true` (a public join would be
 * refused by the realtime.messages RLS policy — and a client that *asked* for
 * a public channel would be the subscribe/forge hole reopened), and the JWT
 * is set on the client before any join so that policy has a user to check.
 */

interface SentEvent {
  event: string
  payload?: unknown
}

class FakeChannel implements RealtimeChannelLike {
  readonly bindings = new Map<string, (message: SentEvent) => void>()
  statusCallback: ((status: string, err?: Error) => void) | undefined
  unsubscribed = false

  constructor(
    readonly topic: string,
    readonly options: { config: { private: boolean } },
  ) {}

  on(
    _type: 'broadcast',
    filter: { event: string },
    callback: (message: SentEvent) => void,
  ): unknown {
    this.bindings.set(filter.event, callback)
    return this
  }

  subscribe(callback?: (status: string, err?: Error) => void): unknown {
    this.statusCallback = callback
    return this
  }

  unsubscribe(): Promise<string> {
    this.unsubscribed = true
    return Promise.resolve('ok')
  }

  /** Deliver a server broadcast, the shape realtime-js hands to `on`. */
  broadcast(event: string, payload: unknown): void {
    this.bindings.get(event)?.({ event, payload })
  }
}

class FakeClient implements RealtimeClientLike {
  readonly channels: FakeChannel[] = []
  readonly calls: string[] = []
  authToken: string | null | undefined

  channel(topic: string, options: { config: { private: boolean } }): FakeChannel {
    this.calls.push(`channel:${topic}`)
    const channel = new FakeChannel(topic, options)
    this.channels.push(channel)
    return channel
  }

  setAuth(token?: string | null): Promise<void> {
    this.calls.push('setAuth')
    this.authToken = token
    return Promise.resolve()
  }

  disconnect(): void {
    this.calls.push('disconnect')
  }
}

describe('createMatchRealtimeTransport', () => {
  it('joins match channels private (#228) with the session JWT set first', () => {
    const client = new FakeClient()
    const transport = createMatchRealtimeTransport(client, 'jwt-1')
    transport.subscribe('match:m1', () => {})

    expect(client.authToken).toBe('jwt-1')
    expect(client.calls.indexOf('setAuth')).toBeLessThan(client.calls.indexOf('channel:match:m1'))
    expect(client.channels).toHaveLength(1)
    expect(client.channels[0]!.topic).toBe('match:m1')
    expect(client.channels[0]!.options.config.private).toBe(true)
  })

  it('drives turnSync and chatSync off one shared channel', () => {
    const client = new FakeClient()
    const transport = createMatchRealtimeTransport(client, 'jwt-1')
    const turns: number[] = []
    const chats: number[] = []
    subscribeTurnSync({ matchId: 'm1', transport, onTurn: (seq) => void turns.push(seq) })
    subscribeChatSync({ matchId: 'm1', transport, onChat: (id) => void chats.push(id) })

    expect(client.channels).toHaveLength(1)
    const channel = client.channels[0]!
    channel.broadcast('turn', { type: 'turn', seq: 3 })
    channel.broadcast('chat', { type: 'chat', id: 8 })
    // Forged/garbage payloads reach the sync modules but never a refetch.
    channel.broadcast('turn', { type: 'turn', seq: 'NaN' })

    expect(turns).toEqual([3])
    expect(chats).toEqual([8])
  })

  it('leaves the channel with the last subscriber and re-joins fresh afterwards', () => {
    const client = new FakeClient()
    const transport = createMatchRealtimeTransport(client, 'jwt-1')
    const unsubA = transport.subscribe('match:m1', () => {})
    const unsubB = transport.subscribe('match:m1', () => {})
    const first = client.channels[0]!

    unsubA()
    expect(first.unsubscribed).toBe(false)
    unsubB()
    expect(first.unsubscribed).toBe(true)

    transport.subscribe('match:m1', () => {})
    expect(client.channels).toHaveLength(2)
    expect(client.channels[1]!.options.config.private).toBe(true)
  })

  it('normalizes join status for reconnectSync and stops after handler unsubscribe', () => {
    const client = new FakeClient()
    const transport = createMatchRealtimeTransport(client, 'jwt-1')
    const statuses: string[] = []
    const stop = transport.onChannelStatusChange((status) => void statuses.push(status))
    transport.subscribe('match:m1', () => {})
    const channel = client.channels[0]!

    channel.statusCallback?.('SUBSCRIBED')
    channel.statusCallback?.('CHANNEL_ERROR')
    channel.statusCallback?.('TIMED_OUT')
    channel.statusCallback?.('CLOSED')
    channel.statusCallback?.('SUBSCRIBED')
    expect(statuses).toEqual([
      'connected',
      'disconnected',
      'disconnected',
      'disconnected',
      'connected',
    ])

    stop()
    channel.statusCallback?.('SUBSCRIBED')
    expect(statuses).toHaveLength(5)
  })

  it('setAuth forwards a refreshed JWT to the client', () => {
    const client = new FakeClient()
    const transport = createMatchRealtimeTransport(client, 'jwt-1')
    transport.setAuth('jwt-2')
    expect(client.authToken).toBe('jwt-2')
  })

  it('dispose tears everything down and refuses new subscriptions', () => {
    const client = new FakeClient()
    const transport = createMatchRealtimeTransport(client, 'jwt-1')
    transport.subscribe('match:m1', () => {})
    const channel = client.channels[0]!

    transport.dispose()
    expect(channel.unsubscribed).toBe(true)
    expect(client.calls).toContain('disconnect')

    const unsub = transport.subscribe('match:m1', () => {})
    expect(client.channels).toHaveLength(1)
    unsub()
  })
})

describe('supabaseRealtimeClient (#260)', () => {
  it('derives the websocket endpoint from an https project URL and forwards the anon key', () => {
    RealtimeClientMock.mockClear()
    supabaseRealtimeClient({ url: 'https://abcproj.supabase.co', anonKey: 'anon-key-1' })

    expect(RealtimeClientMock).toHaveBeenCalledWith('wss://abcproj.supabase.co/realtime/v1', {
      params: { apikey: 'anon-key-1' },
    })
  })

  it('derives a ws:// endpoint from an http project URL (local dev)', () => {
    RealtimeClientMock.mockClear()
    supabaseRealtimeClient({ url: 'http://127.0.0.1:54321', anonKey: 'anon-key-2' })

    expect(RealtimeClientMock).toHaveBeenCalledWith('ws://127.0.0.1:54321/realtime/v1', {
      params: { apikey: 'anon-key-2' },
    })
  })
})
