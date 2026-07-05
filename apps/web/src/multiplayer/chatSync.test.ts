import { describe, expect, it, vi } from 'vitest'
import {
  chatBroadcastPayload,
  isChatChannel,
  MAX_CHAT_LENGTH,
  normalizeChatBody,
} from '@aop/shared'
import { subscribeChatSync, type ChatPokeTransport } from './chatSync'

/** A fake Realtime transport: captures the channel + handler so a test can push pokes. */
function fakeTransport() {
  let handler: ((payload: unknown) => void) | undefined
  let subscribedChannel: string | undefined
  const unsubscribe = vi.fn()
  const transport: ChatPokeTransport = {
    subscribe(channel, onPoke) {
      subscribedChannel = channel
      handler = onPoke
      return unsubscribe
    },
  }
  return {
    transport,
    unsubscribe,
    push: (payload: unknown) => handler?.(payload),
    get channel() {
      return subscribedChannel
    },
  }
}

describe('chatBroadcastPayload (§7 leak-audit: id only, never body or channel)', () => {
  it('produces exactly { type, id } and nothing else', () => {
    const payload = chatBroadcastPayload(42)
    expect(payload).toEqual({ type: 'chat', id: 42 })
    expect(Object.keys(payload).sort()).toEqual(['id', 'type'])
  })

  it('carries no body or channel field for any id', () => {
    for (const id of [0, 1, 7, 9999]) {
      const payload = chatBroadcastPayload(id) as unknown as Record<string, unknown>
      expect(payload.body).toBeUndefined()
      expect(payload.channel).toBeUndefined()
    }
  })
})

describe('isChatChannel', () => {
  it("accepts only 'all' and 'alliance'", () => {
    expect(isChatChannel('all')).toBe(true)
    expect(isChatChannel('alliance')).toBe(true)
    for (const bad of ['team', '', 'ALL', null, undefined, 3, {}]) {
      expect(isChatChannel(bad)).toBe(false)
    }
  })
})

describe('normalizeChatBody', () => {
  it('trims and accepts a non-empty message within the length cap', () => {
    expect(normalizeChatBody('  hoist the colors  ')).toEqual({
      ok: true,
      body: 'hoist the colors',
    })
  })

  it('rejects a non-string, an empty or whitespace-only body', () => {
    expect(normalizeChatBody(42).ok).toBe(false)
    expect(normalizeChatBody('').ok).toBe(false)
    expect(normalizeChatBody('    ').ok).toBe(false)
  })

  it('accepts exactly the length cap and rejects one over', () => {
    expect(normalizeChatBody('a'.repeat(MAX_CHAT_LENGTH))).toEqual({
      ok: true,
      body: 'a'.repeat(MAX_CHAT_LENGTH),
    })
    expect(normalizeChatBody('a'.repeat(MAX_CHAT_LENGTH + 1)).ok).toBe(false)
  })
})

describe('subscribeChatSync (#139 client chat refetch)', () => {
  it('subscribes to the match channel and refetches on a valid chat poke', () => {
    const t = fakeTransport()
    const onChat = vi.fn()
    subscribeChatSync({ matchId: 'm1', transport: t.transport, onChat })

    expect(t.channel).toBe('match:m1')
    t.push(chatBroadcastPayload(3))
    expect(onChat).toHaveBeenCalledExactlyOnceWith(3)
  })

  it('ignores malformed, non-chat, or turn payloads', () => {
    const t = fakeTransport()
    const onChat = vi.fn()
    subscribeChatSync({ matchId: 'm1', transport: t.transport, onChat })

    t.push(null)
    t.push({ type: 'turn', seq: 1 })
    t.push({ type: 'chat' }) // missing id
    t.push({ type: 'chat', id: 'nope' })
    expect(onChat).not.toHaveBeenCalled()
  })

  it('never forwards body smuggled onto a poke — only the numeric id reaches the caller', () => {
    const t = fakeTransport()
    const received: unknown[] = []
    subscribeChatSync({
      matchId: 'm1',
      transport: t.transport,
      onChat: (id) => {
        received.push(id)
      },
    })

    t.push({ type: 'chat', id: 5, body: 'alliance-secret' })
    expect(received).toEqual([5])
    expect(typeof received[0]).toBe('number')
  })

  it('refetches only on strictly increasing id (duplicate/late pokes are harmless)', () => {
    const t = fakeTransport()
    const onChat = vi.fn()
    subscribeChatSync({ matchId: 'm1', transport: t.transport, onChat })

    t.push(chatBroadcastPayload(1))
    t.push(chatBroadcastPayload(1)) // duplicate
    t.push(chatBroadcastPayload(0)) // late/out-of-order
    t.push(chatBroadcastPayload(2))
    expect(onChat.mock.calls).toEqual([[1], [2]])
  })

  it('returns the transport unsubscribe handle', () => {
    const t = fakeTransport()
    const stop = subscribeChatSync({ matchId: 'm1', transport: t.transport, onChat: vi.fn() })
    stop()
    expect(t.unsubscribe).toHaveBeenCalledOnce()
  })
})
