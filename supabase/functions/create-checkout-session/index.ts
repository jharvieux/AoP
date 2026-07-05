// create-checkout-session (docs/ARCHITECTURE.md §9): POST { successUrl, cancelUrl }
// -> { url }. Authenticated only. Creates a Stripe Checkout Session for the
// one-time remove-ads purchase and hands back the hosted checkout URL — the
// client just navigates there (see apps/web/src/monetization/checkout.ts), no
// Stripe.js needed. `stripe-webhook` grants the entitlement once Stripe
// confirms the payment.

import { requireUserId } from '../_shared/client.ts'
import { AppError, errorResponse, guardMethod, jsonResponse } from '../_shared/http.ts'
import {
  createCheckoutSession,
  isAllowedRedirectUrl,
  parseAllowedOrigins,
} from '../_shared/stripe.ts'

Deno.serve(async (req) => {
  const preflight = guardMethod(req)
  if (preflight) return preflight
  try {
    const userId = await requireUserId(req)
    const body = (await req.json().catch(() => ({}))) as {
      successUrl?: string
      cancelUrl?: string
    }
    if (!body.successUrl || !body.cancelUrl) {
      throw new AppError('BAD_REQUEST', 'successUrl and cancelUrl are required')
    }

    // Open-redirect guard (#105): only hand Stripe redirect targets on our own
    // origin. `CHECKOUT_ALLOWED_ORIGINS` is a comma-separated allowlist (prod
    // origin plus any dev origins); its absence is an operator misconfiguration,
    // so fail closed rather than accept an arbitrary redirect.
    const allowedOrigins = parseAllowedOrigins(Deno.env.get('CHECKOUT_ALLOWED_ORIGINS'))
    if (allowedOrigins.length === 0) {
      throw new AppError('INTERNAL', 'Missing CHECKOUT_ALLOWED_ORIGINS')
    }
    if (
      !isAllowedRedirectUrl(body.successUrl, allowedOrigins) ||
      !isAllowedRedirectUrl(body.cancelUrl, allowedOrigins)
    ) {
      throw new AppError('BAD_REQUEST', 'successUrl and cancelUrl must be on an allowed origin')
    }

    const priceId = Deno.env.get('STRIPE_REMOVE_ADS_PRICE_ID')
    if (!priceId) throw new AppError('INTERNAL', 'Missing STRIPE_REMOVE_ADS_PRICE_ID')

    const session = await createCheckoutSession({
      priceId,
      successUrl: body.successUrl,
      cancelUrl: body.cancelUrl,
      userId,
    })
    return jsonResponse({ url: session.url })
  } catch (err) {
    return errorResponse(err)
  }
})
