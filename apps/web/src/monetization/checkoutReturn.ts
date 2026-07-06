/**
 * Fulfillment-state helpers for the Stripe Checkout return trip (#244).
 * `createRemoveAdsCheckoutUrl` previously sent an indistinguishable
 * `successUrl`/`cancelUrl` (both just `origin`), so a client landing back
 * from Checkout had no way to tell "just paid" from an ordinary app open, and
 * the `remove_ads` entitlement only ever appeared once `useRemoveAds`
 * happened to re-fetch on the next auth-state change — racing the
 * `stripe-webhook` that actually grants it. A paying customer could land back
 * on the Account screen still seeing the "Remove Ads" buy button.
 *
 * The fix: tag the success URL with a marker (`withCheckoutSuccessMarker`),
 * detect it on return (`hasCheckoutSuccessMarker`), and poll the entitlement
 * with backoff (`pollForEntitlement`) instead of checking once. Plain,
 * DOM-free functions so the flow is unit-testable without React — see
 * `AccountScreen.tsx`'s `RemoveAdsSection` for the wiring.
 */

export const CHECKOUT_SUCCESS_PARAM = 'checkout'
export const CHECKOUT_SUCCESS_VALUE = 'remove-ads-success'

/** Appends the fulfillment marker to a checkout success URL. */
export function withCheckoutSuccessMarker(url: string): string {
  const u = new URL(url)
  u.searchParams.set(CHECKOUT_SUCCESS_PARAM, CHECKOUT_SUCCESS_VALUE)
  return u.toString()
}

/** True if `search` (e.g. `window.location.search`) carries the marker. */
export function hasCheckoutSuccessMarker(search: string): boolean {
  return new URLSearchParams(search).get(CHECKOUT_SUCCESS_PARAM) === CHECKOUT_SUCCESS_VALUE
}

export interface PollForEntitlementOptions {
  /** Total time to keep polling before giving up. Default 30s. */
  timeoutMs?: number
  /** Delay before the first check — the webhook needs a beat to land. Default 1500ms. */
  initialDelayMs?: number
  /** Backoff multiplier applied to the delay after each miss. Default 1.6. */
  backoffFactor?: number
  /** Injectable sleep, so tests run with fake timers instead of real ones. */
  sleep?: (ms: number) => Promise<void>
  /** Injectable clock, for the same reason. */
  now?: () => number
}

const defaultSleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms))

/**
 * Polls `checkFn` with exponential backoff until it resolves `true` or
 * `timeoutMs` elapses. The `stripe-webhook` that grants `remove_ads` runs
 * asynchronously after Checkout redirects back, so a client can't just check
 * the entitlement once and call it done.
 */
export async function pollForEntitlement(
  checkFn: () => Promise<boolean>,
  opts: PollForEntitlementOptions = {},
): Promise<boolean> {
  const {
    timeoutMs = 30_000,
    initialDelayMs = 1500,
    backoffFactor = 1.6,
    sleep = defaultSleep,
    now = Date.now,
  } = opts
  const deadline = now() + timeoutMs
  let delay = initialDelayMs
  for (;;) {
    await sleep(delay)
    if (await checkFn()) return true
    if (now() + delay >= deadline) return false
    delay *= backoffFactor
  }
}
