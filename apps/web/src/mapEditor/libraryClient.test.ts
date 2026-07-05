import { describe, expect, it, vi } from 'vitest'
import type { SupabaseConfig } from '../auth/supabaseAuth'
import type { AuthSession } from '../auth/types'
import { CommunityLibraryClient, CommunityLibraryError } from './libraryClient'

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

describe('CommunityLibraryClient', () => {
  it('publish posts the map code and name to publish-map', async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse(200, { mapId: 'map-9' }))
    const client = new CommunityLibraryClient(CONFIG, fetchMock)

    const result = await client.publish(SESSION, { mapCode: 'AOPMAP1:abc', name: 'Skull Atoll' })

    expect(result).toEqual({ mapId: 'map-9' })
    const [url, init] = fetchMock.mock.calls[0]!
    expect(url).toBe('https://proj.supabase.co/functions/v1/publish-map')
    const request = init as RequestInit
    expect(request.method).toBe('POST')
    expect(request.headers).toMatchObject({
      apikey: 'anon-key',
      Authorization: 'Bearer access-1',
    })
    expect(JSON.parse(request.body as string)).toEqual({
      mapCode: 'AOPMAP1:abc',
      name: 'Skull Atoll',
    })
  })

  it('surfaces the server error code — a rate-limited publish is distinguishable', async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        jsonResponse(429, { error: { code: 'RATE_LIMITED', message: 'Publish limit reached' } }),
      )
    const client = new CommunityLibraryClient(CONFIG, fetchMock)

    await expect(client.publish(SESSION, { mapCode: 'AOPMAP1:abc' })).rejects.toMatchObject({
      name: 'CommunityLibraryError',
      code: 'RATE_LIMITED',
      message: 'Publish limit reached',
    })
  })

  it('browse passes search and cursor through and defaults a bare response', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValueOnce(jsonResponse(200, {}))
    const client = new CommunityLibraryClient(CONFIG, fetchMock)

    const page = await client.browse(SESSION, { search: 'atoll', before: 'ts|id' })

    expect(page).toEqual({ maps: [], nextBefore: null })
    const [url, init] = fetchMock.mock.calls[0]!
    expect(url).toBe('https://proj.supabase.co/functions/v1/browse-maps')
    expect(JSON.parse((init as RequestInit).body as string)).toEqual({
      search: 'atoll',
      before: 'ts|id',
    })
  })

  it('download and report hit their endpoints with the map id', async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse(200, { mapId: 'm1', mapCode: 'AOPMAP1:x' }))
      .mockResolvedValueOnce(jsonResponse(200, { status: 'hidden', reportCount: 3 }))
    const client = new CommunityLibraryClient(CONFIG, fetchMock)

    await client.download(SESSION, 'm1')
    const report = await client.report(SESSION, 'm1', 'spam')

    expect(report).toEqual({ status: 'hidden', reportCount: 3 })
    expect(fetchMock.mock.calls[0]![0]).toBe('https://proj.supabase.co/functions/v1/download-map')
    expect(fetchMock.mock.calls[1]![0]).toBe('https://proj.supabase.co/functions/v1/report-map')
    expect(JSON.parse((fetchMock.mock.calls[1]![1] as RequestInit).body as string)).toEqual({
      mapId: 'm1',
      reason: 'spam',
    })
  })

  it('maps a network failure to a codeless CommunityLibraryError', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockRejectedValue(new TypeError('offline'))
    const client = new CommunityLibraryClient(CONFIG, fetchMock)

    const failure = client.remove(SESSION, 'm1')
    await expect(failure).rejects.toBeInstanceOf(CommunityLibraryError)
    await expect(failure).rejects.toMatchObject({ code: undefined })
  })
})
