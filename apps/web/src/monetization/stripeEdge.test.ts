import { describe, expect, it, vi } from 'vitest'
// The functions under test are the pure Stripe helpers the `stripe-webhook` and
// `create-checkout-session` Edge Functions run (see supabase/functions/_shared/
// stripe.ts, which imports them via @aop/shared/stripe). They live in @aop/shared
// so this Node/Vitest suite exercises the exact code the Deno runtime does.
// Imported by explicit path because they are intentionally not re-exported from
// @aop/shared's barrel (engine/content typecheck without DOM lib).
import {
  isAllowedRedirectUrl,
  parseAllowedOrigins,
  processStripeWebhook,
  verifyStripeSignature,
} from '../../../../packages/shared/src/stripe'

const SECRET = 'whsec_test_secret'
// A fixed clock inside the 5-minute signature tolerance window.
const NOW_MS = 1_700_000_000_000
const NOW_SECONDS = Math.floor(NOW_MS / 1000)

/**
 * Independently reproduces the `Stripe-Signature` header Stripe would send, so
 * the test asserts against the documented scheme rather than the implementation's
 * own signer.
 */
async function stripeSignature(body: string, secret: string, timestamp: number): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const bytes = await crypto.subtle.sign(
    'HMAC',
    key,
    new TextEncoder().encode(`${timestamp}.${body}`),
  )
  const hex = Array.from(new Uint8Array(bytes))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
  return `t=${timestamp},v1=${hex}`
}

describe('verifyStripeSignature', () => {
  const body = JSON.stringify({ hello: 'world' })

  it('accepts a valid signature within the tolerance window', async () => {
    const header = await stripeSignature(body, SECRET, NOW_SECONDS)
    expect(await verifyStripeSignature(body, header, SECRET, 300, NOW_MS)).toBe(true)
  })

  it('rejects a missing signature header', async () => {
    expect(await verifyStripeSignature(body, null, SECRET, 300, NOW_MS)).toBe(false)
  })

  it('rejects a malformed header without t/v1 parts', async () => {
    expect(await verifyStripeSignature(body, 'not-a-signature', SECRET, 300, NOW_MS)).toBe(false)
  })

  it('rejects a signature computed with the wrong secret', async () => {
    const header = await stripeSignature(body, 'whsec_attacker', NOW_SECONDS)
    expect(await verifyStripeSignature(body, header, SECRET, 300, NOW_MS)).toBe(false)
  })

  it('rejects a tampered body (signature no longer matches)', async () => {
    const header = await stripeSignature(body, SECRET, NOW_SECONDS)
    const tampered = JSON.stringify({ hello: 'world', evil: true })
    expect(await verifyStripeSignature(tampered, header, SECRET, 300, NOW_MS)).toBe(false)
  })

  it('rejects a timestamp outside the tolerance window (replay defense)', async () => {
    const header = await stripeSignature(body, SECRET, NOW_SECONDS)
    const tenMinutesLater = NOW_MS + 10 * 60 * 1000
    expect(await verifyStripeSignature(body, header, SECRET, 300, tenMinutesLater)).toBe(false)
  })

  it('rejects a non-numeric timestamp instead of failing open via NaN', async () => {
    const key = await crypto.subtle.importKey(
      'raw',
      new TextEncoder().encode(SECRET),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign'],
    )
    const bytes = await crypto.subtle.sign(
      'HMAC',
      key,
      new TextEncoder().encode(`not-a-number.${body}`),
    )
    const hex = Array.from(new Uint8Array(bytes))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('')
    const header = `t=not-a-number,v1=${hex}`
    expect(await verifyStripeSignature(body, header, SECRET, 300, NOW_MS)).toBe(false)
  })
})

describe('parseAllowedOrigins', () => {
  it('returns an empty list for undefined or blank input', () => {
    expect(parseAllowedOrigins(undefined)).toEqual([])
    expect(parseAllowedOrigins('   ')).toEqual([])
  })

  it('splits, trims, and normalizes entries to their origin', () => {
    expect(parseAllowedOrigins('https://app.example/path , http://localhost:5173')).toEqual([
      'https://app.example',
      'http://localhost:5173',
    ])
  })
})

describe('isAllowedRedirectUrl', () => {
  const allowed = ['https://app.example']

  it('accepts a URL on an allowed origin regardless of path/query', () => {
    expect(isAllowedRedirectUrl('https://app.example/checkout/ok?x=1', allowed)).toBe(true)
  })

  it('rejects a foreign origin', () => {
    expect(isAllowedRedirectUrl('https://evil.example/ok', allowed)).toBe(false)
  })

  it('rejects a same-host mismatch on scheme or port', () => {
    expect(isAllowedRedirectUrl('http://app.example/ok', allowed)).toBe(false)
    expect(isAllowedRedirectUrl('https://app.example:8443/ok', allowed)).toBe(false)
  })

  it('rejects non-http(s) schemes', () => {
    expect(isAllowedRedirectUrl('javascript:alert(1)', allowed)).toBe(false)
    expect(isAllowedRedirectUrl('data:text/html,<script>', allowed)).toBe(false)
  })

  it('rejects an unparseable string', () => {
    expect(isAllowedRedirectUrl('not a url', allowed)).toBe(false)
  })
})

describe('processStripeWebhook', () => {
  function completedEvent(object: Record<string, unknown>): string {
    return JSON.stringify({ type: 'checkout.session.completed', data: { object } })
  }

  async function signedRequest(body: string) {
    const header = await stripeSignature(body, SECRET, NOW_SECONDS)
    const grantRemoveAds = vi.fn(async () => {})
    const outcome = await processStripeWebhook({
      rawBody: body,
      signatureHeader: header,
      secret: SECRET,
      grantRemoveAds,
      nowMs: NOW_MS,
    })
    return { outcome, grantRemoveAds }
  }

  it('grants the entitlement to client_reference_id on a valid completed event', async () => {
    const body = completedEvent({ client_reference_id: 'user-1' })
    const { outcome, grantRemoveAds } = await signedRequest(body)
    expect(outcome).toEqual({ ok: true, granted: true, userId: 'user-1' })
    expect(grantRemoveAds).toHaveBeenCalledTimes(1)
    expect(grantRemoveAds).toHaveBeenCalledWith('user-1')
  })

  it('falls back to metadata.user_id when client_reference_id is absent', async () => {
    const body = completedEvent({ metadata: { user_id: 'user-2' } })
    const { outcome, grantRemoveAds } = await signedRequest(body)
    expect(outcome).toEqual({ ok: true, granted: true, userId: 'user-2' })
    expect(grantRemoveAds).toHaveBeenCalledTimes(1)
    expect(grantRemoveAds).toHaveBeenCalledWith('user-2')
  })

  it('does not grant for a non-checkout event type', async () => {
    const body = JSON.stringify({ type: 'payment_intent.succeeded', data: { object: {} } })
    const { outcome, grantRemoveAds } = await signedRequest(body)
    expect(outcome).toEqual({ ok: true, granted: false })
    expect(grantRemoveAds).not.toHaveBeenCalled()
  })

  it('does not grant when a completed event carries no user id', async () => {
    const body = completedEvent({})
    const { outcome, grantRemoveAds } = await signedRequest(body)
    expect(outcome).toEqual({ ok: true, granted: false })
    expect(grantRemoveAds).not.toHaveBeenCalled()
  })

  it('rejects an invalid signature without touching the entitlement write', async () => {
    const body = completedEvent({ client_reference_id: 'user-1' })
    const grantRemoveAds = vi.fn(async () => {})
    const outcome = await processStripeWebhook({
      rawBody: body,
      signatureHeader: await stripeSignature(body, 'whsec_attacker', NOW_SECONDS),
      secret: SECRET,
      grantRemoveAds,
      nowMs: NOW_MS,
    })
    expect(outcome).toEqual({ ok: false })
    expect(grantRemoveAds).not.toHaveBeenCalled()
  })
})
