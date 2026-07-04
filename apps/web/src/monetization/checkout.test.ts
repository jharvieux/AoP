import { describe, expect, it, vi } from 'vitest'
import type { SupabaseConfig } from '../auth/supabaseAuth'
import type { AuthSession } from '../auth/types'
import { CheckoutError, createRemoveAdsCheckoutUrl } from './checkout'

const CONFIG: SupabaseConfig = { url: 'https://proj.supabase.co', anonKey: 'anon-key' }
const SESSION: AuthSession = {
  accessToken: 'access-1',
  refreshToken: 'refresh-1',
  expiresAt: 10_000_000,
  user: { id: 'user-1', email: 'cap@plunder.io' },
}
const PARAMS = { successUrl: 'https://app.example/ok', cancelUrl: 'https://app.example/cancel' }

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

describe('createRemoveAdsCheckoutUrl', () => {
  it('posts to the create-checkout-session function and returns the hosted URL', async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse(200, { url: 'https://checkout.stripe.com/session-1' }))

    const url = await createRemoveAdsCheckoutUrl(CONFIG, SESSION, PARAMS, fetchMock)
    expect(url).toBe('https://checkout.stripe.com/session-1')

    const [calledUrl, init] = fetchMock.mock.calls[0]!
    expect(calledUrl).toBe('https://proj.supabase.co/functions/v1/create-checkout-session')
    const request = init as RequestInit
    expect(request.method).toBe('POST')
    expect(request.headers).toMatchObject({
      apikey: 'anon-key',
      Authorization: 'Bearer access-1',
    })
    expect(JSON.parse(request.body as string)).toEqual(PARAMS)
  })

  it('throws CheckoutError with the server message on a non-OK response', async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse(500, { error: { message: 'Stripe is down' } }))
    await expect(
      createRemoveAdsCheckoutUrl(CONFIG, SESSION, PARAMS, fetchMock),
    ).rejects.toMatchObject({ message: 'Stripe is down' })
  })

  it('throws CheckoutError when the response has no url', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValueOnce(jsonResponse(200, {}))
    await expect(
      createRemoveAdsCheckoutUrl(CONFIG, SESSION, PARAMS, fetchMock),
    ).rejects.toBeInstanceOf(CheckoutError)
  })

  it('maps a network failure to CheckoutError', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockRejectedValue(new TypeError('offline'))
    await expect(
      createRemoveAdsCheckoutUrl(CONFIG, SESSION, PARAMS, fetchMock),
    ).rejects.toMatchObject({
      message: 'Could not reach the server. Check your connection.',
    })
  })
})
