import { useEffect, useState } from 'react'
import { resolveSupabaseConfig } from '../auth/config'
import { useAuth } from '../auth'
import { EntitlementsClient, hasRemoveAds } from './entitlements'

/**
 * Whether the signed-in viewer holds the `remove_ads` entitlement. Guests are
 * never entitled — an account is required for the purchase to persist
 * (docs/ARCHITECTURE.md §9) — and any fetch failure fails open (ads keep
 * showing) rather than throwing into the render tree.
 *
 * This hook itself isn't unit-tested (same as AuthContext.tsx); the fetch
 * logic it wraps lives in `EntitlementsClient`, which is (see
 * entitlements.test.ts).
 */
export function useRemoveAds(): boolean {
  const auth = useAuth()
  const [removeAds, setRemoveAds] = useState(false)

  useEffect(() => {
    if (auth.state.status !== 'authenticated') {
      setRemoveAds(false)
      return
    }
    const config = resolveSupabaseConfig()
    if (!config) return

    let cancelled = false
    const client = new EntitlementsClient(config)
    void client
      .fetchKeys(auth.state.session)
      .then((keys) => {
        if (!cancelled) setRemoveAds(hasRemoveAds(keys))
      })
      .catch(() => {
        // Fail open: keep showing ads rather than surface an error for a
        // background entitlement check.
      })
    return () => {
      cancelled = true
    }
  }, [auth.state])

  return removeAds
}
