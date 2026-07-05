import { describe, expect, it } from 'vitest'
import { resolveAdNetworkConfig } from './adConfig'

describe('resolveAdNetworkConfig', () => {
  it('returns null when unset (no ad network configured)', () => {
    expect(resolveAdNetworkConfig({})).toBeNull()
  })

  it('returns null when only one of the two vars is set', () => {
    expect(
      resolveAdNetworkConfig({ VITE_AD_NETWORK_SCRIPT_URL: 'https://ads.example/tag.js' }),
    ).toBeNull()
    expect(resolveAdNetworkConfig({ VITE_AD_NETWORK_SLOT_ID: 'slot-1' })).toBeNull()
  })

  it('returns the config when both vars are set', () => {
    expect(
      resolveAdNetworkConfig({
        VITE_AD_NETWORK_SCRIPT_URL: 'https://ads.example/tag.js',
        VITE_AD_NETWORK_SLOT_ID: 'slot-1',
      }),
    ).toEqual({ scriptUrl: 'https://ads.example/tag.js', slotId: 'slot-1' })
  })
})
