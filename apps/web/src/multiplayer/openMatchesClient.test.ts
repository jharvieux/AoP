import { describe, expect, it, vi } from 'vitest'
import type { SupabaseConfig } from '../auth/supabaseAuth'
import type { AuthSession } from '../auth/types'
import { OpenMatchesClient, OpenMatchesError } from './openMatchesClient'

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

describe('OpenMatchesClient.listOpenMatches', () => {
  it('posts limit/before to list-open-matches and returns matches + nextBefore', async () => {
    const page = {
      matches: [
        {
          matchId: 'm1',
          mapSize: 'medium',
          maxPlayers: 4,
          playerCount: 1,
          turnTimerSeconds: 86400,
          createdAt: '2026-07-05T12:00:00.000Z',
        },
      ],
      nextBefore: '2026-07-05T12:00:00.000Z|m1',
    }
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValueOnce(jsonResponse(200, page))
    const client = new OpenMatchesClient(CONFIG, fetchMock)

    const result = await client.listOpenMatches(SESSION, { limit: 10, before: 'cursor-1' })

    expect(result).toEqual(page)
    const [url, init] = fetchMock.mock.calls[0]!
    expect(url).toBe('https://proj.supabase.co/functions/v1/list-open-matches')
    const request = init as RequestInit
    expect(request.method).toBe('POST')
    expect(request.headers).toMatchObject({
      apikey: 'anon-key',
      Authorization: 'Bearer access-1',
    })
    expect(JSON.parse(request.body as string)).toEqual({ limit: 10, before: 'cursor-1' })
  })

  it('omits before on the first page', async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse(200, { matches: [], nextBefore: null }))
    const client = new OpenMatchesClient(CONFIG, fetchMock)

    await client.listOpenMatches(SESSION)

    const [, init] = fetchMock.mock.calls[0]!
    expect(JSON.parse((init as RequestInit).body as string)).toEqual({
      limit: undefined,
      before: undefined,
    })
  })

  it('throws OpenMatchesError with the server code/message on failure', async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse(500, { error: { code: 'INTERNAL', message: 'boom' } }))
    const client = new OpenMatchesClient(CONFIG, fetchMock)

    await expect(client.listOpenMatches(SESSION)).rejects.toMatchObject({
      message: 'boom',
      code: 'INTERNAL',
    })
  })

  it('maps a network failure to a codeless OpenMatchesError', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockRejectedValue(new TypeError('offline'))
    const client = new OpenMatchesClient(CONFIG, fetchMock)

    await expect(client.listOpenMatches(SESSION)).rejects.toBeInstanceOf(OpenMatchesError)
  })
})

describe('OpenMatchesClient.joinMatch', () => {
  it('posts matchId to join-match and returns the assigned seat', async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse(200, { matchId: 'm1', seat: 2 }))
    const client = new OpenMatchesClient(CONFIG, fetchMock)

    const result = await client.joinMatch(SESSION, 'm1')

    expect(result).toEqual({ matchId: 'm1', seat: 2 })
    const [url, init] = fetchMock.mock.calls[0]!
    expect(url).toBe('https://proj.supabase.co/functions/v1/join-match')
    expect(JSON.parse((init as RequestInit).body as string)).toEqual({ matchId: 'm1' })
  })

  it('surfaces MATCH_STATE when the lobby filled before the join landed', async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        jsonResponse(409, { error: { code: 'MATCH_STATE', message: 'Match is full' } }),
      )
    const client = new OpenMatchesClient(CONFIG, fetchMock)

    await expect(client.joinMatch(SESSION, 'm1')).rejects.toMatchObject({
      code: 'MATCH_STATE',
      message: 'Match is full',
    })
  })
})
