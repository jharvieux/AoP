import { useRemoveAdsStatus } from './useRemoveAds'

/**
 * Global "Finishing your purchase…" notice (#244). A remove-ads buyer returns
 * from Stripe to the main menu, not the Account screen, so the pending
 * fulfillment state must be visible wherever they land while the entitlement
 * poll races the stripe-webhook. Rendered app-wide next to `UpdateBanner`,
 * whose styling it reuses; disappears once the poll settles either way.
 */
export function CheckoutPendingBanner() {
  const { purchasePending } = useRemoveAdsStatus()
  if (!purchasePending) return null
  return <div className="update-banner">Finishing your purchase…</div>
}
