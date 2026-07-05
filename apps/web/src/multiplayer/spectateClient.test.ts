import { describe, expect, it, vi } from 'vitest'
import type { SupabaseConfig } from '../auth/supabaseAuth'
import type { AuthSession } from '../auth/types'
import { SpectateClient, SpectateError } from './spectateClient'

const CONFIG: SupabaseConfig = { url: 'https://proj.supabase.co', anonKey: 'anon-key' }
const SESSION: AuthSession = {
  accessToken: 'access-1',
  refreshToken: 'refresh-1',
  expiresAt: 10_000_000,
  user: { id: 'user-1', email: 'creator@plunder.io' },
}

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

describe('SpectateClient.designateSpectator', () => {
  it('posts matchId/userId/seat to designate-spectator', async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse(200, { matchId: 'm1', userId: 'user-2', seat: 1 }))
    const client = new SpectateClient(CONFIG, fetchMock)

    await client.designateSpectator(SESSION, { matchId: 'm1', userId: 'user-2', seat: 1 })

    const [url, init] = fetchMock.mock.calls[0]!
    expect(url).toBe('https://proj.supabase.co/functions/v1/designate-spectator')
    const request = init as RequestInit
    expect(request.method).toBe('POST')
    expect(request.headers).toMatchObject({
      apikey: 'anon-key',
      Authorization: 'Bearer access-1',
    })
    expect(JSON.parse(request.body as string)).toEqual({ matchId: 'm1', userId: 'user-2', seat: 1 })
  })

  it('throws SpectateError with the server code/message on failure', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValueOnce(
      jsonResponse(403, {
        error: { code: 'FORBIDDEN', message: 'Only the match creator may designate spectators' },
      }),
    )
    const client = new SpectateClient(CONFIG, fetchMock)

    await expect(
      client.designateSpectator(SESSION, { matchId: 'm1', userId: 'user-2', seat: 1 }),
    ).rejects.toMatchObject({
      message: 'Only the match creator may designate spectators',
      code: 'FORBIDDEN',
    })
  })

  it('maps a network failure to a codeless SpectateError', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockRejectedValue(new TypeError('offline'))
    const client = new SpectateClient(CONFIG, fetchMock)

    await expect(
      client.designateSpectator(SESSION, { matchId: 'm1', userId: 'user-2', seat: 1 }),
    ).rejects.toBeInstanceOf(SpectateError)
  })
})

describe('SpectateClient.getPlayerView', () => {
  it('posts matchId to get-player-view and returns the seq/seat/role/view/turnDeadline body', async () => {
    const body = {
      seq: 7,
      seat: 1,
      role: 'spectator',
      view: { viewerId: 'seat-1', round: 2 },
      turnDeadline: null,
    }
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValueOnce(jsonResponse(200, body))
    const client = new SpectateClient(CONFIG, fetchMock)

    const result = await client.getPlayerView(SESSION, 'm1')
    expect(result).toEqual(body)

    const [url, init] = fetchMock.mock.calls[0]!
    expect(url).toBe('https://proj.supabase.co/functions/v1/get-player-view')
    expect(JSON.parse((init as RequestInit).body as string)).toEqual({ matchId: 'm1' })
  })

  it('surfaces FORBIDDEN when the caller holds neither a seat nor a spectator grant', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValueOnce(
      jsonResponse(403, {
        error: {
          code: 'FORBIDDEN',
          message: 'You do not hold a seat or spectator grant in this match',
        },
      }),
    )
    const client = new SpectateClient(CONFIG, fetchMock)

    await expect(client.getPlayerView(SESSION, 'm1')).rejects.toMatchObject({ code: 'FORBIDDEN' })
  })
})
