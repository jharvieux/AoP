import { describe, expect, it, vi } from 'vitest'
import type { SupabaseConfig } from '../auth/supabaseAuth'
import type { AuthSession } from '../auth/types'
import { EntitlementsClient, hasRemoveAds } from './entitlements'

const CONFIG: SupabaseConfig = { url: 'https://proj.supabase.co', anonKey: 'anon-key' }
const SESSION: AuthSession = {
  accessToken: 'access-1',
  refreshToken: 'refresh-1',
  expiresAt: 10_000_000,
  user: { id: 'user-1', email: 'cap@plunder.io' },
}

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

describe('EntitlementsClient', () => {
  it('fetches the caller entitlement keys scoped to their user id', async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse(200, [{ key: 'remove_ads', source: 'stripe' }]))
    const client = new EntitlementsClient(CONFIG, fetchMock)
    const keys = await client.fetchKeys(SESSION)

    expect(keys).toEqual(['remove_ads'])
    const [url, init] = fetchMock.mock.calls[0]!
    expect(url).toBe('https://proj.supabase.co/rest/v1/entitlements?user_id=eq.user-1&select=key')
    expect((init as RequestInit).headers).toMatchObject({
      apikey: 'anon-key',
      Authorization: 'Bearer access-1',
    })
  })

  it('returns an empty list when the caller has no entitlements', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValueOnce(jsonResponse(200, []))
    const client = new EntitlementsClient(CONFIG, fetchMock)
    expect(await client.fetchKeys(SESSION)).toEqual([])
  })

  it('fails open (empty list) on a non-OK response rather than throwing', async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse(403, { error: 'nope' }))
    const client = new EntitlementsClient(CONFIG, fetchMock)
    expect(await client.fetchKeys(SESSION)).toEqual([])
  })

  it('fails open when the response body is not JSON', async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response('not json', { status: 200 }))
    const client = new EntitlementsClient(CONFIG, fetchMock)
    expect(await client.fetchKeys(SESSION)).toEqual([])
  })
})

describe('hasRemoveAds', () => {
  it('is true when remove_ads is present', () => {
    expect(hasRemoveAds(['remove_ads'])).toBe(true)
    expect(hasRemoveAds(['other_key', 'remove_ads'])).toBe(true)
  })

  it('is false otherwise', () => {
    expect(hasRemoveAds([])).toBe(false)
    expect(hasRemoveAds(['other_key'])).toBe(false)
  })
})
