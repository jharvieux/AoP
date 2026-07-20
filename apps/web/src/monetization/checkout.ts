import type { SupabaseConfig } from '../auth/supabaseAuth'
import type { AuthSession } from '../auth/types'

export class CheckoutError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'CheckoutError'
  }
}

export interface CheckoutParams {
  /** Where Stripe redirects after a successful payment. */
  successUrl: string
  /** Where Stripe redirects if the customer cancels. */
  cancelUrl: string
}

/** Query param + value stamped onto `successUrl` (#244) so the app can tell a
 * successful checkout return apart from any other visit to the origin — the
 * cancel URL carries no marker, so cancel and success are no longer identical. */
export const CHECKOUT_RETURN_PARAM = 'checkout'
const REMOVE_ADS_SUCCESS_VALUE = 'remove-ads-success'

/** The `successUrl` for a remove-ads purchase: `origin` plus the success marker. */
export function removeAdsSuccessUrl(origin: string): string {
  const url = new URL(origin)
  url.searchParams.set(CHECKOUT_RETURN_PARAM, REMOVE_ADS_SUCCESS_VALUE)
  return url.toString()
}

/** Whether a location `search` string carries the remove-ads success marker. */
export function isRemoveAdsSuccessReturn(search: string): boolean {
  return new URLSearchParams(search).get(CHECKOUT_RETURN_PARAM) === REMOVE_ADS_SUCCESS_VALUE
}

/**
 * Starts the web remove-ads purchase: asks the `create-checkout-session` Edge
 * Function for a Stripe-hosted Checkout URL and returns it. No `@stripe/stripe-js`
 * dependency needed — Stripe Checkout is a plain redirect, so the caller just
 * navigates the browser to the returned URL (see screens/AccountScreen.tsx).
 */
export async function createRemoveAdsCheckoutUrl(
  config: SupabaseConfig,
  session: AuthSession,
  params: CheckoutParams,
  fetchImpl: typeof fetch = fetch,
): Promise<string> {
  const url = `${config.url.replace(/\/$/, '')}/functions/v1/create-checkout-session`
  let res: Response
  try {
    res = await fetchImpl(url, {
      method: 'POST',
      headers: {
        apikey: config.anonKey,
        Authorization: `Bearer ${session.accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(params),
    })
  } catch {
    throw new CheckoutError('Could not reach the server. Check your connection.')
  }

  const body = (await res.json().catch(() => ({}))) as {
    url?: string
    error?: { message?: string }
  }
  if (!res.ok || !body.url) {
    throw new CheckoutError(body.error?.message ?? 'Could not start checkout.')
  }
  return body.url
}
