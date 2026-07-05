import { describe, expect, it, vi } from 'vitest'
import type { SupabaseConfig } from '../auth/supabaseAuth'
import type { AuthSession } from '../auth/types'
import { LeaderboardClient, LeaderboardError } from './leaderboardClient'

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

describe('LeaderboardClient.fetchTop', () => {
  it('posts limit to get-leaderboard and returns the ranked entries', async () => {
    const entries = [
      { userId: 'u1', displayName: 'Blackbeard', rating: 1500, matchesPlayed: 10, rank: 1 },
      { userId: 'u2', displayName: 'Anne Bonny', rating: 1400, matchesPlayed: 8, rank: 2 },
    ]
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValueOnce(jsonResponse(200, { entries }))
    const client = new LeaderboardClient(CONFIG, fetchMock)

    const result = await client.fetchTop(SESSION, 20)

    expect(result).toEqual(entries)
    const [url, init] = fetchMock.mock.calls[0]!
    expect(url).toBe('https://proj.supabase.co/functions/v1/get-leaderboard')
    const request = init as RequestInit
    expect(request.method).toBe('POST')
    expect(request.headers).toMatchObject({
      apikey: 'anon-key',
      Authorization: 'Bearer access-1',
    })
    expect(JSON.parse(request.body as string)).toEqual({ limit: 20 })
  })

  it('returns an empty array when the response carries no entries', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValueOnce(jsonResponse(200, {}))
    const client = new LeaderboardClient(CONFIG, fetchMock)

    expect(await client.fetchTop(SESSION)).toEqual([])
  })

  it('throws LeaderboardError with the server message on failure', async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse(500, { error: { message: 'boom' } }))
    const client = new LeaderboardClient(CONFIG, fetchMock)

    await expect(client.fetchTop(SESSION)).rejects.toMatchObject({ message: 'boom' })
  })

  it('maps a network failure to a codeless LeaderboardError', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockRejectedValue(new TypeError('offline'))
    const client = new LeaderboardClient(CONFIG, fetchMock)

    await expect(client.fetchTop(SESSION)).rejects.toBeInstanceOf(LeaderboardError)
  })
})
