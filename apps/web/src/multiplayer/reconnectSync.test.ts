import { describe, expect, it, vi } from 'vitest'
import {
  resyncOnSeqConflict,
  subscribeReconnectSync,
  type ChannelConnectionStatus,
  type ResyncTransport,
} from './reconnectSync'

/** A fake resync transport: captures each handler so a test can fire events directly. */
function fakeTransport() {
  let channelHandler: ((status: ChannelConnectionStatus) => void) | undefined
  let networkHandler: ((online: boolean) => void) | undefined
  let visibilityHandler: (() => void) | undefined
  const unsubscribeChannel = vi.fn()
  const unsubscribeNetwork = vi.fn()
  const unsubscribeVisibility = vi.fn()

  const transport: ResyncTransport = {
    onChannelStatusChange(handler) {
      channelHandler = handler
      return unsubscribeChannel
    },
    onNetworkStatusChange(handler) {
      networkHandler = handler
      return unsubscribeNetwork
    },
    onVisibilityReturn(handler) {
      visibilityHandler = handler
      return unsubscribeVisibility
    },
  }

  return {
    transport,
    unsubscribeChannel,
    unsubscribeNetwork,
    unsubscribeVisibility,
    fireChannelStatus: (status: ChannelConnectionStatus) => channelHandler?.(status),
    fireNetworkStatus: (online: boolean) => networkHandler?.(online),
    fireVisibilityReturn: () => visibilityHandler?.(),
  }
}

describe('subscribeReconnectSync (#145 discard-and-refetch on reconnect)', () => {
  it('does not resync on the initial channel connect (§9 step 1 already fetches once)', () => {
    const t = fakeTransport()
    const onResync = vi.fn()
    subscribeReconnectSync({ transport: t.transport, onResync })

    t.fireChannelStatus('connected')
    expect(onResync).not.toHaveBeenCalled()
  })

  it('resyncs on a channel reconnect after a prior drop', () => {
    const t = fakeTransport()
    const onResync = vi.fn()
    subscribeReconnectSync({ transport: t.transport, onResync })

    t.fireChannelStatus('connected') // initial subscribe, ignored
    t.fireChannelStatus('disconnected')
    t.fireChannelStatus('connected') // reconnect
    expect(onResync).toHaveBeenCalledOnce()
  })

  it('resyncs on every subsequent reconnect, not just the first', () => {
    const t = fakeTransport()
    const onResync = vi.fn()
    subscribeReconnectSync({ transport: t.transport, onResync })

    t.fireChannelStatus('connected')
    t.fireChannelStatus('disconnected')
    t.fireChannelStatus('connected')
    t.fireChannelStatus('disconnected')
    t.fireChannelStatus('connected')
    expect(onResync).toHaveBeenCalledTimes(2)
  })

  it('does not resync on disconnect itself, only on the return to connected', () => {
    const t = fakeTransport()
    const onResync = vi.fn()
    subscribeReconnectSync({ transport: t.transport, onResync })

    t.fireChannelStatus('connected')
    t.fireChannelStatus('disconnected')
    expect(onResync).not.toHaveBeenCalled()
  })

  it('resyncs when the network comes back online', () => {
    const t = fakeTransport()
    const onResync = vi.fn()
    subscribeReconnectSync({ transport: t.transport, onResync })

    t.fireNetworkStatus(true)
    expect(onResync).toHaveBeenCalledOnce()
  })

  it('does not resync when the network goes offline', () => {
    const t = fakeTransport()
    const onResync = vi.fn()
    subscribeReconnectSync({ transport: t.transport, onResync })

    t.fireNetworkStatus(false)
    expect(onResync).not.toHaveBeenCalled()
  })

  it('resyncs when the tab regains visibility/focus', () => {
    const t = fakeTransport()
    const onResync = vi.fn()
    subscribeReconnectSync({ transport: t.transport, onResync })

    t.fireVisibilityReturn()
    expect(onResync).toHaveBeenCalledOnce()
  })

  it('invokes onResync with no payload — nothing for a caller to merge/diff-patch (§13)', () => {
    const t = fakeTransport()
    const received: unknown[] = []
    subscribeReconnectSync({
      transport: t.transport,
      onResync: (...args: unknown[]) => {
        received.push(args)
      },
    })

    t.fireNetworkStatus(true)
    t.fireVisibilityReturn()
    expect(received).toEqual([[], []])
  })

  it('unsubscribing stops all three sources', () => {
    const t = fakeTransport()
    const stop = subscribeReconnectSync({ transport: t.transport, onResync: vi.fn() })
    stop()

    expect(t.unsubscribeChannel).toHaveBeenCalledOnce()
    expect(t.unsubscribeNetwork).toHaveBeenCalledOnce()
    expect(t.unsubscribeVisibility).toHaveBeenCalledOnce()
  })
})

describe('resyncOnSeqConflict (#145, §9 step 3: SEQ_CONFLICT discards and refetches)', () => {
  it('triggers onResync and returns true for a SEQ_CONFLICT error envelope', () => {
    const onResync = vi.fn()
    const result = resyncOnSeqConflict(
      { error: { code: 'SEQ_CONFLICT', message: 'Your view is stale; refetch and retry' } },
      onResync,
    )

    expect(result).toBe(true)
    expect(onResync).toHaveBeenCalledOnce()
  })

  it('ignores other error codes and returns false', () => {
    const onResync = vi.fn()
    for (const code of [
      'NOT_YOUR_TURN',
      'INVALID_ACTION',
      'MATCH_STATE',
      'FORBIDDEN',
      'NOT_FOUND',
    ]) {
      const result = resyncOnSeqConflict({ error: { code, message: 'nope' } }, onResync)
      expect(result).toBe(false)
    }
    expect(onResync).not.toHaveBeenCalled()
  })

  it('ignores malformed or non-error bodies', () => {
    const onResync = vi.fn()
    for (const body of [
      null,
      undefined,
      {},
      { error: null },
      { error: 'SEQ_CONFLICT' },
      'SEQ_CONFLICT',
    ]) {
      expect(resyncOnSeqConflict(body, onResync)).toBe(false)
    }
    expect(onResync).not.toHaveBeenCalled()
  })

  it('never forwards the error message/content to the caller — onResync takes no payload', () => {
    const received: unknown[] = []
    resyncOnSeqConflict(
      { error: { code: 'SEQ_CONFLICT', message: 'secret details' } },
      (...args: unknown[]) => {
        received.push(args)
      },
    )
    expect(received).toEqual([[]])
  })
})
