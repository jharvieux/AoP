import { describe, expect, it } from 'vitest'
import { isNativePlatform, nativePlatformName, purchaseRemoveAdsNative } from './iap'

describe('isNativePlatform', () => {
  it('is false with no window (SSR/test/node)', () => {
    expect(isNativePlatform(undefined)).toBe(false)
  })

  it('is false when window.Capacitor is absent (plain web)', () => {
    expect(isNativePlatform({})).toBe(false)
  })

  it('is true when Capacitor reports a native platform', () => {
    expect(isNativePlatform({ Capacitor: { isNativePlatform: () => true } })).toBe(true)
  })

  it('is false when Capacitor reports web', () => {
    expect(isNativePlatform({ Capacitor: { isNativePlatform: () => false } })).toBe(false)
  })
})

describe('nativePlatformName', () => {
  it('defaults to web with no window', () => {
    expect(nativePlatformName(undefined)).toBe('web')
  })

  it('defaults to web when Capacitor is absent', () => {
    expect(nativePlatformName({})).toBe('web')
  })

  it('reads ios/android from Capacitor.getPlatform', () => {
    expect(nativePlatformName({ Capacitor: { getPlatform: () => 'ios' } })).toBe('ios')
    expect(nativePlatformName({ Capacitor: { getPlatform: () => 'android' } })).toBe('android')
  })

  it('falls back to web for an unrecognized platform string', () => {
    expect(nativePlatformName({ Capacitor: { getPlatform: () => 'windows' } })).toBe('web')
  })
})

describe('purchaseRemoveAdsNative', () => {
  it('is unavailable on the web (no Capacitor)', async () => {
    expect(await purchaseRemoveAdsNative({})).toBe('unavailable')
  })

  it('is unavailable on native when the IAP plugin is not registered', async () => {
    expect(
      await purchaseRemoveAdsNative({ Capacitor: { isNativePlatform: () => true, Plugins: {} } }),
    ).toBe('unavailable')
  })

  it('resolves purchased when the plugin succeeds', async () => {
    const result = await purchaseRemoveAdsNative({
      Capacitor: {
        isNativePlatform: () => true,
        Plugins: { Purchases: { purchase: async () => ({ cancelled: false }) } },
      },
    })
    expect(result).toBe('purchased')
  })

  it('resolves cancelled when the plugin reports a cancellation', async () => {
    const result = await purchaseRemoveAdsNative({
      Capacitor: {
        isNativePlatform: () => true,
        Plugins: { Purchases: { purchase: async () => ({ cancelled: true }) } },
      },
    })
    expect(result).toBe('cancelled')
  })

  it('resolves error when the plugin throws', async () => {
    const result = await purchaseRemoveAdsNative({
      Capacitor: {
        isNativePlatform: () => true,
        Plugins: {
          Purchases: {
            purchase: async () => {
              throw new Error('boom')
            },
          },
        },
      },
    })
    expect(result).toBe('error')
  })
})
