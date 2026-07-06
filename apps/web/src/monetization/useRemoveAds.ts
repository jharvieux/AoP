import { useEffect, useState } from 'react'
import { resolveSupabaseConfig } from '../auth/config'
import { useAuth } from '../auth'
import { detectCheckoutReturn, sharedRemoveAdsPoll } from './checkoutReturn'
import { EntitlementsClient, hasRemoveAds } from './entitlements'

export interface RemoveAdsStatus {
  /** Whether the signed-in viewer holds the `remove_ads` entitlement. */
  removeAds: boolean
  /**
   * A checkout return is pending fulfillment (#244): the buyer just came back
   * from Stripe with the success marker and the webhook grant hasn't been
   * observed yet. UI reaction: show "Finishing your purchase…" and hide the
   * buy button — never offer to sell it again mid-fulfillment.
   */
  purchasePending: boolean
}

/**
 * Remove-ads entitlement + checkout-return state. Guests are never entitled —
 * an account is required for the purchase to persist (docs/ARCHITECTURE.md §9)
 * — and any fetch failure fails open (ads keep showing) rather than throwing
 * into the render tree.
 *
 * Normally this is one entitlement fetch per auth-state change. After a Stripe
 * checkout return (the `?checkout=remove-ads-success` marker, #244) it instead
 * awaits the module-level shared backoff poll (~30s) racing the stripe-webhook
 * fulfillment, holding `purchasePending` high until it settles.
 *
 * This hook itself isn't unit-tested (same as AuthContext.tsx); the pieces it
 * wraps are — `EntitlementsClient` (entitlements.test.ts) and the marker/poll
 * logic (checkoutReturn.test.ts, checkout.test.ts).
 */
export function useRemoveAdsStatus(): RemoveAdsStatus {
  const auth = useAuth()
  const [removeAds, setRemoveAds] = useState(false)
  const [purchasePending, setPurchasePending] = useState(false)

  useEffect(() => {
    if (auth.state.status !== 'authenticated') {
      setRemoveAds(false)
      setPurchasePending(false)
      return
    }
    const config = resolveSupabaseConfig()
    if (!config) return

    let cancelled = false
    const client = new EntitlementsClient(config)
    const session = auth.state.session

    if (detectCheckoutReturn()) {
      setPurchasePending(true)
      void sharedRemoveAdsPoll(() => client.fetchKeys(session)).then((granted) => {
        if (cancelled) return
        setRemoveAds(granted)
        setPurchasePending(false)
      })
    } else {
      void client
        .fetchKeys(session)
        .then((keys) => {
          if (!cancelled) setRemoveAds(hasRemoveAds(keys))
        })
        .catch(() => {
          // Fail open: keep showing ads rather than surface an error for a
          // background entitlement check.
        })
    }
    return () => {
      cancelled = true
    }
  }, [auth.state])

  return { removeAds, purchasePending }
}

/** Boolean-only view of {@link useRemoveAdsStatus} for ad suppression (`<AdSlot>`). */
export function useRemoveAds(): boolean {
  return useRemoveAdsStatus().removeAds
}
