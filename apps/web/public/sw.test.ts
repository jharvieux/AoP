import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it, vi } from 'vitest'

// sw.js is a plain browser script (no module system — see vite-plugins/swVersion.ts
// for the build-time placeholder substitution) and isn't imported anywhere, so it's
// otherwise untestable through the normal module graph. Load its source into a
// stubbed ServiceWorkerGlobalScope and dispatch synthetic message events to exercise
// the SKIP_WAITING guard (#572) without invoking the install/activate/fetch handlers,
// which this test never triggers and so doesn't need to stub.
const swSource = readFileSync(fileURLToPath(new URL('./sw.js', import.meta.url)), 'utf-8')

function loadMessageHandler() {
  const listeners: Record<string, (event: unknown) => void> = {}
  const skipWaiting = vi.fn()
  const self = {
    location: { origin: 'https://aop.example' },
    addEventListener: (type: string, listener: (event: unknown) => void) => {
      listeners[type] = listener
    },
    skipWaiting,
  }
  new Function('self', swSource)(self)
  const onMessage = listeners.message
  if (!onMessage) throw new Error('sw.js did not register a message listener')
  return { onMessage, skipWaiting }
}

describe('sw.js message handler (SKIP_WAITING guard)', () => {
  it('skips waiting for a same-origin, well-shaped message', () => {
    const { onMessage, skipWaiting } = loadMessageHandler()
    onMessage({ origin: 'https://aop.example', data: { type: 'SKIP_WAITING' } })
    expect(skipWaiting).toHaveBeenCalledOnce()
  })

  it('ignores a cross-origin sender', () => {
    const { onMessage, skipWaiting } = loadMessageHandler()
    onMessage({ origin: 'https://evil.example', data: { type: 'SKIP_WAITING' } })
    expect(skipWaiting).not.toHaveBeenCalled()
  })

  it('ignores malformed or unexpected message shapes', () => {
    const { onMessage, skipWaiting } = loadMessageHandler()
    onMessage({ origin: 'https://aop.example', data: null })
    onMessage({ origin: 'https://aop.example', data: 'SKIP_WAITING' })
    onMessage({ origin: 'https://aop.example', data: { type: 'OTHER' } })
    onMessage({ origin: 'https://aop.example' })
    expect(skipWaiting).not.toHaveBeenCalled()
  })
})
