import { describe, expect, it, vi } from 'vitest'
import { subscribeSpectatePoll, type PollTimer } from './spectatePoll'

/** A fake timer: captures the handler/interval and lets a test drive ticks manually. */
function fakeTimer() {
  let handler: (() => void) | undefined
  let intervalMs: number | undefined
  const clearInterval = vi.fn()
  const timer: PollTimer = {
    setInterval(h, ms) {
      handler = h
      intervalMs = ms
      return 1
    },
    clearInterval,
  }
  return {
    timer,
    clearInterval,
    tick: () => handler?.(),
    get intervalMs() {
      return intervalMs
    },
  }
}

describe('subscribeSpectatePoll', () => {
  it('starts an interval at the requested cadence', () => {
    const t = fakeTimer()
    subscribeSpectatePoll({ intervalMs: 4000, onTick: vi.fn(), timer: t.timer })
    expect(t.intervalMs).toBe(4000)
  })

  it('does not call onTick before the first interval elapses', () => {
    const t = fakeTimer()
    const onTick = vi.fn()
    subscribeSpectatePoll({ intervalMs: 4000, onTick, timer: t.timer })
    expect(onTick).not.toHaveBeenCalled()
  })

  it('calls onTick on every interval tick', () => {
    const t = fakeTimer()
    const onTick = vi.fn()
    subscribeSpectatePoll({ intervalMs: 4000, onTick, timer: t.timer })
    t.tick()
    t.tick()
    expect(onTick).toHaveBeenCalledTimes(2)
  })

  it('stops ticking once unsubscribed', () => {
    const t = fakeTimer()
    const stop = subscribeSpectatePoll({ intervalMs: 4000, onTick: vi.fn(), timer: t.timer })
    stop()
    expect(t.clearInterval).toHaveBeenCalledWith(1)
  })
})
