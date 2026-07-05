import { describe, expect, it, vi } from 'vitest'
import type { SupabaseConfig } from '../auth/supabaseAuth'
import type { AuthSession } from '../auth/types'
import { MatchmakingQueueClient, MatchmakingQueueError } from './matchmakingQueueClient'

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

describe('MatchmakingQueueClient.join', () => {
  it("upserts the caller's own row directly against PostgREST (no Edge Function)", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValueOnce(jsonResponse(201, []))
    const client = new MatchmakingQueueClient(CONFIG, fetchMock)

    await client.join(SESSION, { matchSize: 4, mapSize: 'medium', faction: 'pirates' })

    const [url, init] = fetchMock.mock.calls[0]!
    expect(url).toBe('https://proj.supabase.co/rest/v1/matchmaking_queue')
    const request = init as RequestInit
    expect(request.method).toBe('POST')
    expect(request.headers).toMatchObject({
      apikey: 'anon-key',
      Authorization: 'Bearer access-1',
      Prefer: 'resolution=merge-duplicates',
    })
    expect(JSON.parse(request.body as string)).toEqual({
      user_id: 'user-1',
      match_size: 4,
      map_size: 'medium',
      faction: 'pirates',
    })
  })

  it('defaults an omitted faction preference to null', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValueOnce(jsonResponse(201, []))
    const client = new MatchmakingQueueClient(CONFIG, fetchMock)

    await client.join(SESSION, { matchSize: 2, mapSize: 'small' })

    const [, init] = fetchMock.mock.calls[0]!
    expect(JSON.parse((init as RequestInit).body as string)).toMatchObject({ faction: null })
  })

  it('throws MatchmakingQueueError on a non-ok response', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValueOnce(jsonResponse(403, {}))
    const client = new MatchmakingQueueClient(CONFIG, fetchMock)

    await expect(client.join(SESSION, { matchSize: 2, mapSize: 'small' })).rejects.toBeInstanceOf(
      MatchmakingQueueError,
    )
  })
})

describe('MatchmakingQueueClient.leave', () => {
  it("deletes the caller's own row by user_id", async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response(null, { status: 204 }))
    const client = new MatchmakingQueueClient(CONFIG, fetchMock)

    await client.leave(SESSION)

    const [url, init] = fetchMock.mock.calls[0]!
    expect(url).toBe('https://proj.supabase.co/rest/v1/matchmaking_queue?user_id=eq.user-1')
    expect((init as RequestInit).method).toBe('DELETE')
  })
})

describe('MatchmakingQueueClient.myStatus', () => {
  it("returns the caller's own queue row, camelCased", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValueOnce(
      jsonResponse(200, [
        {
          match_size: 4,
          map_size: 'medium',
          faction: 'pirates',
          queued_at: '2026-07-05T00:00:00Z',
        },
      ]),
    )
    const client = new MatchmakingQueueClient(CONFIG, fetchMock)

    const status = await client.myStatus(SESSION)

    expect(status).toEqual({
      matchSize: 4,
      mapSize: 'medium',
      faction: 'pirates',
      queuedAt: '2026-07-05T00:00:00Z',
    })
    const [url] = fetchMock.mock.calls[0]!
    expect(url).toContain('/rest/v1/matchmaking_queue?user_id=eq.user-1')
    expect(url).toContain('select=match_size,map_size,faction,queued_at')
  })

  it('returns null once the row has been drained', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValueOnce(jsonResponse(200, []))
    const client = new MatchmakingQueueClient(CONFIG, fetchMock)

    expect(await client.myStatus(SESSION)).toBeNull()
  })
})

describe('MatchmakingQueueClient.mySeatedMatchIds', () => {
  it('reads match_players scoped to the caller (RLS-safe direct REST read)', async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse(200, [{ match_id: 'm1' }, { match_id: 'm2' }]))
    const client = new MatchmakingQueueClient(CONFIG, fetchMock)

    const ids = await client.mySeatedMatchIds(SESSION)

    expect(ids).toEqual(['m1', 'm2'])
    const [url] = fetchMock.mock.calls[0]!
    expect(url).toBe(
      'https://proj.supabase.co/rest/v1/match_players?user_id=eq.user-1&select=match_id',
    )
  })
})
