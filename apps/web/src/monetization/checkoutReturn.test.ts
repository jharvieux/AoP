import { describe, expect, it } from 'vitest'
import { isRemoveAdsSuccessReturn, removeAdsSuccessUrl } from './checkout'
import { ENTITLEMENT_POLL_DELAYS_MS, pollForRemoveAds } from './checkoutReturn'

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
