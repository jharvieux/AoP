// Minimal, dependency-free Stripe REST client (docs/ARCHITECTURE.md §9). Mirrors
// the "no SDK, just fetch" convention from apps/web/src/auth/supabaseAuth.ts —
// Stripe's API is a small, stable REST surface, and the handful of calls Edge
// Functions need here (create a Checkout Session, verify a webhook signature)
// aren't worth pulling in the `stripe` npm package for.

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

/** Creates a Stripe Checkout Session for the one-time remove-ads purchase. */
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
  })

  const res = await fetchImpl(`${STRIPE_API}/checkout/sessions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${requireStripeSecretKey()}`,
      'Content-Type': 'application/x-www-form-urlencoded',
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

/**
 * Verifies a Stripe webhook request per Stripe's documented scheme: the
 * `Stripe-Signature` header carries `t=<unix timestamp>,v1=<hex hmac>`, where
 * the hmac is SHA-256 over `${timestamp}.${rawBody}` keyed by the endpoint's
 * signing secret. https://stripe.com/docs/webhooks/signatures
 *
 * `rawBody` must be the exact bytes Stripe sent (read via `req.text()` before
 * any JSON parsing) — re-serializing a parsed body will not reproduce the
 * signature.
 */
export async function verifyStripeSignature(
  rawBody: string,
  signatureHeader: string | null,
  secret: string,
  toleranceSeconds = 300,
  nowMs: number = Date.now(),
): Promise<boolean> {
  if (!signatureHeader) return false
  const parts: Record<string, string> = {}
  for (const kv of signatureHeader.split(',')) {
    const [k, v] = kv.split('=')
    if (k && v) parts[k] = v
  }
  const timestamp = parts.t
  const v1 = parts.v1
  if (!timestamp || !v1) return false
  if (Math.abs(nowMs / 1000 - Number(timestamp)) > toleranceSeconds) return false

  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const signatureBytes = await crypto.subtle.sign(
    'HMAC',
    key,
    new TextEncoder().encode(`${timestamp}.${rawBody}`),
  )
  const expected = Array.from(new Uint8Array(signatureBytes))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
  return timingSafeEqual(expected, v1)
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}
