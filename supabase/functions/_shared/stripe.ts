// Minimal, dependency-free Stripe REST client (docs/ARCHITECTURE.md §9). Mirrors
// the "no SDK, just fetch" convention from apps/web/src/auth/supabaseAuth.ts —
// Stripe's API is a small, stable REST surface, and the handful of calls Edge
// Functions need here (create a Checkout Session, verify a webhook signature)
// aren't worth pulling in the `stripe` npm package for.

// Signature verification, the checkout-redirect allowlist, and the webhook event
// handler live in @aop/shared/stripe (pure, Web-standard-only) so they're covered
// by the Vitest suite in apps/web. Re-exported here so the function entrypoints
// keep importing everything Stripe-related from one module.
export {
  checkoutIdempotencyKey,
  isAllowedRedirectUrl,
  parseAllowedOrigins,
  processStripeWebhook,
  REMOVE_ADS_PRODUCT,
  verifyStripeSignature,
} from '@aop/shared/stripe'
import { checkoutIdempotencyKey, REMOVE_ADS_PRODUCT } from '@aop/shared/stripe'

const STRIPE_API = 'https://api.stripe.com/v1'

// deno-lint-ignore no-explicit-any
function env(key: string): string | undefined {
  return (globalThis as any).Deno?.env.get(key)
}

export function requireStripeSecretKey(): string {
  const key = env('STRIPE_SECRET_KEY')
  if (!key) throw new Error('Missing STRIPE_SECRET_KEY')
  return key
}

export interface CheckoutSessionParams {
  priceId: string
  successUrl: string
  cancelUrl: string
  /** The Supabase auth user id — carried through to the webhook as both fields. */
  userId: string
}

export interface CheckoutSession {
  id: string
  url: string
}

/**
 * Creates a Stripe Checkout Session for the one-time remove-ads purchase.
 *
 * Sends a per-user `Idempotency-Key` (#222) so a double-click or duplicate
 * request within Stripe's idempotency window returns the original session
 * instead of creating a second live one — the caller (`create-checkout-session`)
 * is also expected to short-circuit already-entitled users before reaching here.
 */
export async function createCheckoutSession(
  params: CheckoutSessionParams,
  fetchImpl: typeof fetch = fetch,
): Promise<CheckoutSession> {
  const body = new URLSearchParams({
    mode: 'payment',
    'line_items[0][price]': params.priceId,
    'line_items[0][quantity]': '1',
    success_url: params.successUrl,
    cancel_url: params.cancelUrl,
    client_reference_id: params.userId,
    'metadata[user_id]': params.userId,
    'metadata[product]': REMOVE_ADS_PRODUCT,
  })

  const res = await fetchImpl(`${STRIPE_API}/checkout/sessions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${requireStripeSecretKey()}`,
      'Content-Type': 'application/x-www-form-urlencoded',
      'Idempotency-Key': checkoutIdempotencyKey(params.userId),
    },
    body,
  })
  const json = (await res.json().catch(() => ({}))) as {
    id?: string
    url?: string
    error?: { message?: string }
  }
  if (!res.ok || !json.url || !json.id) {
    throw new Error(json.error?.message ?? 'Stripe checkout session creation failed')
  }
  return { id: json.id, url: json.url }
}
