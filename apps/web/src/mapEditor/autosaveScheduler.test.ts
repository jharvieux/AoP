import { describe, expect, it, vi } from 'vitest'
import { createAutosaveScheduler, type DebounceTimer } from './autosaveScheduler'

/** A fake debounce timer: captures the pending handler/id and lets a test fire it manually. */
function fakeTimer() {
  let nextId = 1
  const pending = new Map<number, () => void>()
  const clearTimeout = vi.fn((id: number) => pending.delete(id))
  const timer: DebounceTimer = {
    setTimeout(handler) {
      const id = nextId++
      pending.set(id, handler)
      return id
    },
    clearTimeout,
  }
  return {
    timer,
    clearTimeout,
    pendingCount: () => pending.size,
    fireAll: () => {
      for (const handler of [...pending.values()]) handler()
    },
  }
}

describe('createAutosaveScheduler', () => {
  it('does not save immediately on schedule()', () => {
    const t = fakeTimer()
    const save = vi.fn()
    const scheduler = createAutosaveScheduler({ delayMs: 2000, save, timer: t.timer })

    scheduler.schedule('draft-v1')

    expect(save).not.toHaveBeenCalled()
    expect(t.pendingCount()).toBe(1)
  })

  it('saves the latest value once the debounce window elapses', () => {
    const t = fakeTimer()
    const save = vi.fn()
    const scheduler = createAutosaveScheduler({ delayMs: 2000, save, timer: t.timer })

    scheduler.schedule('draft-v1')
    t.fireAll()

    expect(save).toHaveBeenCalledExactlyOnceWith('draft-v1')
  })

  it('restarts the debounce window on every schedule() call, coalescing rapid edits', () => {
    const t = fakeTimer()
    const save = vi.fn()
    const scheduler = createAutosaveScheduler({ delayMs: 2000, save, timer: t.timer })

    scheduler.schedule('draft-v1') // e.g. first tile painted
    scheduler.schedule('draft-v2') // second tile painted before the debounce fired
    t.fireAll()

    expect(t.clearTimeout).toHaveBeenCalledTimes(1) // the v1 timer was cancelled
    expect(save).toHaveBeenCalledExactlyOnceWith('draft-v2')
  })

  it('cancel() drops a pending save so nothing writes after teardown', () => {
    const t = fakeTimer()
    const save = vi.fn()
    const scheduler = createAutosaveScheduler({ delayMs: 2000, save, timer: t.timer })

    scheduler.schedule('draft-v1')
    scheduler.cancel()
    t.fireAll()

    expect(save).not.toHaveBeenCalled()
  })

  it('cancel() with nothing pending is a no-op', () => {
    const t = fakeTimer()
    const scheduler = createAutosaveScheduler({ delayMs: 2000, save: vi.fn(), timer: t.timer })

    expect(() => scheduler.cancel()).not.toThrow()
    expect(t.clearTimeout).not.toHaveBeenCalled()
  })
})
