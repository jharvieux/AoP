// stripe-webhook (docs/ARCHITECTURE.md §9): POST, called by Stripe itself — not a
// client, so there's no Supabase Authorization header to check. Trust is
// established instead by verifying the `Stripe-Signature` header against
// STRIPE_WEBHOOK_SECRET (see _shared/stripe.ts). On `checkout.session.completed`,
// grants the `remove_ads` entitlement to the user who started checkout
// (create-checkout-session sets both `client_reference_id` and
// `metadata.user_id` to their Supabase auth user id).

import { serviceClient } from '../_shared/client.ts'
import { errorResponse, guardMethod, jsonResponse } from '../_shared/http.ts'
import { verifyStripeSignature } from '../_shared/stripe.ts'

interface CheckoutSessionCompleted {
  type?: string
  data?: {
    object?: {
      client_reference_id?: string
      metadata?: { user_id?: string }
    }
  }
}

Deno.serve(async (req) => {
  const preflight = guardMethod(req)
  if (preflight) return preflight
  try {
    const secret = Deno.env.get('STRIPE_WEBHOOK_SECRET')
    if (!secret) throw new Error('Missing STRIPE_WEBHOOK_SECRET')

    // Signature verification needs Stripe's exact raw bytes — read as text
    // before any JSON parsing.
    const rawBody = await req.text()
    const valid = await verifyStripeSignature(rawBody, req.headers.get('Stripe-Signature'), secret)
    if (!valid)
      return jsonResponse({ error: { code: 'FORBIDDEN', message: 'Invalid signature' } }, 400)

    const event = JSON.parse(rawBody) as CheckoutSessionCompleted
    if (event.type === 'checkout.session.completed') {
      const object = event.data?.object
      const userId = object?.client_reference_id ?? object?.metadata?.user_id
      if (userId) {
        const db = serviceClient()
        const { error } = await db
          .from('entitlements')
          .upsert(
            { user_id: userId, key: 'remove_ads', source: 'stripe' },
            { onConflict: 'user_id,key', ignoreDuplicates: true },
          )
        if (error) throw new Error(`Could not grant entitlement: ${error.message}`)
      }
    }

    return jsonResponse({ received: true })
  } catch (err) {
    return errorResponse(err)
  }
})
