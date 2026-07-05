/**
 * Pure, dependency-free Stripe helpers shared between the `stripe-webhook` and
 * `create-checkout-session` Edge Functions (which import this via the
 * `@aop/shared/stripe` entry in `supabase/functions/deno.json`) and their Vitest
 * coverage in `apps/web`. Everything here uses only Web-standard globals
 * (`crypto.subtle`, `TextEncoder`, `URL`), so it runs unchanged under Deno, the
 * browser, and Node — matching @aop/shared's "no runtime dependencies" rule.
 *
 * Deliberately NOT re-exported from `@aop/shared`'s barrel: the engine and
 * content packages typecheck under `lib: ES2022` (no DOM), so pulling these
 * Web-crypto globals into their program would break `pnpm typecheck`. Only the
 * Edge Functions and their tests reach for this module, via its explicit path.
 */

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

/**
 * Splits the comma-separated `CHECKOUT_ALLOWED_ORIGINS` env value into normalized
 * origins (scheme + host + port). Bare origins that don't parse as a full URL are
 * kept as-is so an operator can list `https://app.example` without a trailing path.
 */
export function parseAllowedOrigins(raw: string | undefined): string[] {
  if (!raw) return []
  return raw
    .split(',')
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0)
    .map((entry) => {
      try {
        return new URL(entry).origin
      } catch {
        return entry
      }
    })
}

/**
 * Open-redirect guard for Stripe Checkout success/cancel URLs (#105): a candidate
 * is only accepted when it parses as an http(s) URL whose origin is in the
 * operator-configured allowlist. Anything else — a foreign origin, a `javascript:`
 * or `data:` scheme, or an unparseable string — is rejected.
 */
export function isAllowedRedirectUrl(candidate: string, allowedOrigins: string[]): boolean {
  let url: URL
  try {
    url = new URL(candidate)
  } catch {
    return false
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return false
  return allowedOrigins.includes(url.origin)
}

interface CheckoutSessionCompletedEvent {
  type?: string
  data?: {
    object?: {
      client_reference_id?: string
      metadata?: { user_id?: string }
    }
  }
}

/** Outcome of processing a webhook request. `ok: false` means the signature was rejected. */
export type StripeWebhookOutcome = { ok: false } | { ok: true; granted: boolean; userId?: string }

/**
 * Verifies the signature, then, for a `checkout.session.completed` event, grants
 * the remove-ads entitlement to the user who started checkout
 * (`create-checkout-session` sets both `client_reference_id` and
 * `metadata.user_id` to their Supabase auth user id). `grantRemoveAds` is injected
 * so the entitlement write is exercised in tests without a live database.
 */
export async function processStripeWebhook(params: {
  rawBody: string
  signatureHeader: string | null
  secret: string
  grantRemoveAds: (userId: string) => Promise<void>
  nowMs?: number
}): Promise<StripeWebhookOutcome> {
  const valid = await verifyStripeSignature(
    params.rawBody,
    params.signatureHeader,
    params.secret,
    undefined,
    params.nowMs,
  )
  if (!valid) return { ok: false }

  const event = JSON.parse(params.rawBody) as CheckoutSessionCompletedEvent
  if (event.type !== 'checkout.session.completed') return { ok: true, granted: false }

  const object = event.data?.object
  const userId = object?.client_reference_id ?? object?.metadata?.user_id
  if (!userId) return { ok: true, granted: false }

  await params.grantRemoveAds(userId)
  return { ok: true, granted: true, userId }
}
