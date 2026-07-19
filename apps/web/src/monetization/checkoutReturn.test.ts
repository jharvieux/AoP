import { afterEach, describe, expect, it } from 'vitest'
import { isRemoveAdsSuccessReturn, removeAdsSuccessUrl } from './checkout'
import {
  ENTITLEMENT_POLL_DELAYS_MS,
  clearCheckoutPending,
  detectCheckoutReturn,
  pollForRemoveAds,
  sharedRemoveAdsPoll,
} from './checkoutReturn'

/**
 * Checkout-return fulfillment (#244): the success-URL marker round-trip and
 * the entitlement backoff poll that races the stripe-webhook. The intent under
 * test: a buyer returning from Stripe is detected (and a cancel is NOT), and
 * the poll keeps re-checking on the documented ~30s schedule until the grant
 * appears — treating a transient fetch failure as "not yet", never as an
 * abort — then reports honestly if the webhook still hasn't landed.
 */

describe('remove-ads success marker (#244)', () => {
  it('stamps the marker onto the origin and recognizes it back', () => {
    const url = removeAdsSuccessUrl('https://app.example')
    expect(url).toBe('https://app.example/?checkout=remove-ads-success')
    expect(isRemoveAdsSuccessReturn(new URL(url).search)).toBe(true)
  })

  it('preserves existing query params on the success URL', () => {
    const url = removeAdsSuccessUrl('https://app.example/?theme=dark')
    const parsed = new URL(url)
    expect(parsed.searchParams.get('theme')).toBe('dark')
    expect(parsed.searchParams.get('checkout')).toBe('remove-ads-success')
  })

  it('does not fire on a cancel return or unrelated queries', () => {
    // cancelUrl is the bare origin — indistinguishability was the bug.
    expect(isRemoveAdsSuccessReturn('')).toBe(false)
    expect(isRemoveAdsSuccessReturn('?theme=dark')).toBe(false)
    expect(isRemoveAdsSuccessReturn('?checkout=other')).toBe(false)
  })
})

describe('pollForRemoveAds (#244)', () => {
  const sleeps: number[] = []
  const sleep = (ms: number) => {
    sleeps.push(ms)
    return Promise.resolve()
  }

  it('resolves immediately (no sleeps) when the entitlement is already granted', async () => {
    sleeps.length = 0
    const granted = await pollForRemoveAds(async () => ['remove_ads'], sleep)
    expect(granted).toBe(true)
    expect(sleeps).toEqual([])
  })

  it('backs off between re-checks and stops as soon as the grant appears', async () => {
    sleeps.length = 0
    let attempts = 0
    const fetchKeys = async () => (++attempts >= 3 ? ['remove_ads'] : [])
    const granted = await pollForRemoveAds(fetchKeys, sleep)
    expect(granted).toBe(true)
    expect(attempts).toBe(3)
    expect(sleeps).toEqual([...ENTITLEMENT_POLL_DELAYS_MS.slice(0, 2)])
  })

  it('gives up honestly after the full ~30s schedule when no grant lands', async () => {
    sleeps.length = 0
    let attempts = 0
    const granted = await pollForRemoveAds(async () => {
      attempts++
      return []
    }, sleep)
    expect(granted).toBe(false)
    // One immediate check plus one per backoff delay.
    expect(attempts).toBe(ENTITLEMENT_POLL_DELAYS_MS.length + 1)
    expect(sleeps).toEqual([...ENTITLEMENT_POLL_DELAYS_MS])
    // The schedule the doc promises: roughly 30 seconds end to end.
    expect(sleeps.reduce((a, b) => a + b, 0)).toBe(30_000)
  })

  it('treats a fetch failure as "not granted yet", not as an abort', async () => {
    sleeps.length = 0
    let attempts = 0
    const fetchKeys = async (): Promise<string[]> => {
      attempts++
      if (attempts === 1) throw new Error('network blip')
      return ['remove_ads']
    }
    const granted = await pollForRemoveAds(fetchKeys, sleep)
    expect(granted).toBe(true)
    expect(attempts).toBe(2)
    expect(sleeps).toEqual([ENTITLEMENT_POLL_DELAYS_MS[0]])
  })
})

/**
 * `detectCheckoutReturn`/`clearCheckoutPending`/`sharedRemoveAdsPoll` (#556):
 * these had no direct coverage at all — every existing test above exercises
 * only `pollForRemoveAds` — so stubbing any of the three left this suite
 * green. A minimal fake `window` (this project has no jsdom dependency; see
 * audioManager.test.ts) stands in for `location`/`sessionStorage`/`history`.
 */
function fakeWindow(href: string) {
  const location = new URL(href)
  const store = new Map<string, string>()
  return {
    location,
    sessionStorage: {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => void store.set(key, value),
      removeItem: (key: string) => void store.delete(key),
    },
    history: {
      replaceState: (_state: unknown, _title: string, url: string) => {
        location.href = url
      },
    },
  }
}

describe('detectCheckoutReturn / clearCheckoutPending (#244)', () => {
  afterEach(() => {
    delete (globalThis as { window?: unknown }).window
  })

  it('consumes the success marker: strips it from the URL and marks the return pending', () => {
    const win = fakeWindow('https://app.example/?checkout=remove-ads-success&theme=dark')
    ;(globalThis as unknown as { window: typeof win }).window = win

    expect(detectCheckoutReturn()).toBe(true)
    expect(win.location.search).toBe('?theme=dark')

    // Reload-safe: the marker is gone from the URL, but the pending state
    // set by the first call must survive (that's the whole point of stashing
    // it in sessionStorage rather than only reading the URL each time).
    win.location.href = 'https://app.example/'
    expect(detectCheckoutReturn()).toBe(true)
  })

  it('reports no pending return when there is no marker and nothing was previously stored', () => {
    const win = fakeWindow('https://app.example/')
    ;(globalThis as unknown as { window: typeof win }).window = win

    expect(detectCheckoutReturn()).toBe(false)
  })

  it('does not treat a cancel return (no marker) as pending', () => {
    const win = fakeWindow('https://app.example/?theme=dark')
    ;(globalThis as unknown as { window: typeof win }).window = win

    expect(detectCheckoutReturn()).toBe(false)
    expect(win.location.search).toBe('?theme=dark')
  })

  it('clearCheckoutPending clears a pending return so a later check reports false', () => {
    const win = fakeWindow('https://app.example/?checkout=remove-ads-success')
    ;(globalThis as unknown as { window: typeof win }).window = win

    expect(detectCheckoutReturn()).toBe(true)
    clearCheckoutPending()
    expect(detectCheckoutReturn()).toBe(false)
  })
})

describe('sharedRemoveAdsPoll (#244)', () => {
  afterEach(() => {
    delete (globalThis as { window?: unknown }).window
  })

  it('memoizes concurrent callers onto the same poll and clears pending once it settles', async () => {
    const win = fakeWindow('https://app.example/?checkout=remove-ads-success')
    ;(globalThis as unknown as { window: typeof win }).window = win
    detectCheckoutReturn() // marks pending, same as boot would

    let calls = 0
    const fetchKeys = async () => {
      calls++
      return ['remove_ads']
    }
    const first = sharedRemoveAdsPoll(fetchKeys)
    const second = sharedRemoveAdsPoll(async () => {
      throw new Error('should never be called — a concurrent caller must reuse the first poll')
    })

    expect(second).toBe(first)
    expect(await first).toBe(true)
    expect(calls).toBe(1)
    // The poll settling clears the pending flag left over from detectCheckoutReturn.
    expect(detectCheckoutReturn()).toBe(false)
  })

  it('starts a fresh poll (and re-checks) once the previous one has settled', async () => {
    const win = fakeWindow('https://app.example/')
    ;(globalThis as unknown as { window: typeof win }).window = win

    let calls = 0
    const fetchKeys = async () => {
      calls++
      return ['remove_ads']
    }
    expect(await sharedRemoveAdsPoll(fetchKeys)).toBe(true)
    expect(calls).toBe(1)
    expect(await sharedRemoveAdsPoll(fetchKeys)).toBe(true)
    expect(calls).toBe(2)
  })
})
