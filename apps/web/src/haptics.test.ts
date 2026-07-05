import { afterEach, describe, expect, it, vi } from 'vitest'
import { hapticImpact, hapticNotify, hapticTap } from './haptics'

afterEach(() => {
  // @ts-expect-error -- test-only cleanup of a property we stub per-test
  delete navigator.vibrate
})

describe('haptics', () => {
  it('is a safe no-op when the Vibration API is unavailable (desktop, iOS Safari)', () => {
    expect(hapticTap()).toBe(false)
    expect(hapticImpact()).toBe(false)
    expect(hapticNotify()).toBe(false)
  })

  it('fires a short single pulse for a tap', () => {
    const vibrate = vi.fn().mockReturnValue(true)
    Object.assign(navigator, { vibrate })
    expect(hapticTap()).toBe(true)
    expect(vibrate).toHaveBeenCalledWith(10)
  })

  it('fires a longer pulse for a confirmed action', () => {
    const vibrate = vi.fn().mockReturnValue(true)
    Object.assign(navigator, { vibrate })
    hapticImpact()
    expect(vibrate).toHaveBeenCalledWith(20)
  })

  it('fires a multi-pulse pattern for a notification', () => {
    const vibrate = vi.fn().mockReturnValue(true)
    Object.assign(navigator, { vibrate })
    hapticNotify()
    expect(vibrate).toHaveBeenCalledWith([15, 40, 15])
  })
})
