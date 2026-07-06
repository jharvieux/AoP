import { describe, expect, it, vi } from 'vitest'
import {
  hasCheckoutSuccessMarker,
  pollForEntitlement,
  withCheckoutSuccessMarker,
} from './checkoutReturn'

describe('withCheckoutSuccessMarker / hasCheckoutSuccessMarker', () => {
  it('appends the marker to a bare origin', () => {
    const url = withCheckoutSuccessMarker('https://app.example')
    expect(url).toBe('https://app.example/?checkout=remove-ads-success')
    expect(hasCheckoutSuccessMarker(new URL(url).search)).toBe(true)
  })

  it('preserves an existing query string alongside the marker', () => {
    const url = withCheckoutSuccessMarker('https://app.example/?ref=menu')
    const search = new URL(url).search
    expect(hasCheckoutSuccessMarker(search)).toBe(true)
    expect(new URLSearchParams(search).get('ref')).toBe('menu')
  })

  it('is false for an ordinary app open with no marker', () => {
    expect(hasCheckoutSuccessMarker('')).toBe(false)
    expect(hasCheckoutSuccessMarker('?ref=menu')).toBe(false)
  })

  it('rejects a forged/unrelated value for the same param', () => {
    expect(hasCheckoutSuccessMarker('?checkout=anything-else')).toBe(false)
  })
})

describe('pollForEntitlement', () => {
  const noopSleep = async () => undefined

  it('resolves true as soon as checkFn reports the entitlement', async () => {
    const checkFn = vi.fn().mockResolvedValueOnce(false).mockResolvedValueOnce(true)
    const resolved = await pollForEntitlement(checkFn, { sleep: noopSleep })
    expect(resolved).toBe(true)
    expect(checkFn).toHaveBeenCalledTimes(2)
  })

  it('gives up and resolves false once the deadline passes', async () => {
    const checkFn = vi.fn().mockResolvedValue(false)
    let clock = 0
    const resolved = await pollForEntitlement(checkFn, {
      timeoutMs: 10_000,
      initialDelayMs: 1000,
      backoffFactor: 2,
      sleep: async (ms) => {
        clock += ms
      },
      now: () => clock,
    })
    expect(resolved).toBe(false)
    // Never checks forever — bounded by the deadline.
    expect(checkFn.mock.calls.length).toBeLessThan(10)
  })

  it('always checks at least once even with a near-zero timeout', async () => {
    const checkFn = vi.fn().mockResolvedValueOnce(true)
    const resolved = await pollForEntitlement(checkFn, {
      timeoutMs: 0,
      initialDelayMs: 0,
      sleep: noopSleep,
    })
    expect(resolved).toBe(true)
    expect(checkFn).toHaveBeenCalledTimes(1)
  })
})
