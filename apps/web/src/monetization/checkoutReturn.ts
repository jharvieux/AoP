import { CHECKOUT_RETURN_PARAM, isRemoveAdsSuccessReturn } from './checkout'
import { hasRemoveAds } from './entitlements'

/**
 * Checkout-return fulfillment handling (#244). Stripe redirects a successful
 * remove-ads buyer back to the origin with the `?checkout=remove-ads-success`
 * marker (see `removeAdsSuccessUrl`), racing the `stripe-webhook` that actually
 * grants the entitlement. Without this module the buyer landed on a screen that
 * still sold them the purchase (useRemoveAds fetches once and fails open) —
 * inviting a confused double purchase.
 *
 * On boot the marker is consumed into sessionStorage (surviving an immediate
 * reload, never a new tab/session) and stripped from the URL; while pending,
 * `useRemoveAdsStatus` polls the entitlement with backoff for ~30s, the UI
 * shows "Finishing your purchase…", and the buy button stays hidden. If the
 * webhook still hasn't landed after the last attempt, the pending state clears
 * and the UI falls back to the old fail-open behavior. Server-side hardening
 * (webhook retries etc.) is #222.
 */

/** Backoff delays between entitlement re-checks, ~30s total (2+3+5+8+12). */
export const ENTITLEMENT_POLL_DELAYS_MS: readonly number[] = [2000, 3000, 5000, 8000, 12000]

/**
 * Poll `fetchKeys` until it reports the remove-ads entitlement or the delays
 * run out: one immediate check, then one after each backoff delay. A fetch
 * failure counts as "not granted yet" (the next attempt retries) rather than
 * aborting the poll. Pure in its dependencies (injected fetch + sleep) so the
 * schedule is unit-testable without real time.
 */
export async function pollForRemoveAds(
  fetchKeys: () => Promise<string[]>,
  sleep: (ms: number) => Promise<void>,
  delays: readonly number[] = ENTITLEMENT_POLL_DELAYS_MS,
): Promise<boolean> {
  const granted = () => fetchKeys().then(hasRemoveAds, () => false)
  if (await granted()) return true
  for (const ms of delays) {
    await sleep(ms)
    if (await granted()) return true
  }
  return false
}

const PENDING_KEY = 'aop-checkout-pending'

/**
 * Whether a checkout return is pending fulfillment. Consumes the URL marker on
 * first sight: stores the pending flag in sessionStorage and strips the query
 * param via `history.replaceState` so a reload or copied URL never re-triggers
 * a stale "finishing purchase" state after it resolved.
 */
export function detectCheckoutReturn(): boolean {
  if (typeof window === 'undefined') return false
  if (isRemoveAdsSuccessReturn(window.location.search)) {
    window.sessionStorage.setItem(PENDING_KEY, '1')
    const url = new URL(window.location.href)
    url.searchParams.delete(CHECKOUT_RETURN_PARAM)
    window.history.replaceState(null, '', url.toString())
  }
  return window.sessionStorage.getItem(PENDING_KEY) === '1'
}

/** Clear the pending flag once the poll resolved (granted or timed out). */
export function clearCheckoutPending(): void {
  if (typeof window === 'undefined') return
  window.sessionStorage.removeItem(PENDING_KEY)
}

const realSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))

let activePoll: Promise<boolean> | null = null

/**
 * The app-wide poll for a pending checkout return. Module-level memoized so
 * every hook instance (the account screen and the global banner) awaits the
 * SAME poll instead of each firing its own request train; cleared when it
 * settles so a later purchase in the same session starts fresh.
 */
export function sharedRemoveAdsPoll(fetchKeys: () => Promise<string[]>): Promise<boolean> {
  activePoll ??= pollForRemoveAds(fetchKeys, realSleep).finally(() => {
    activePoll = null
    clearCheckoutPending()
  })
  return activePoll
}
