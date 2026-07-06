import { describe, expect, it, vi } from 'vitest'
import type { SupabaseConfig } from '../auth/supabaseAuth'
import type { AuthSession } from '../auth/types'
import { MatchActionClient, MatchActionError } from './matchActionClient'

const CONFIG: SupabaseConfig = { url: 'https://proj.supabase.co', anonKey: 'anon-key' }
const SESSION: AuthSession = {
  accessToken: 'access-1',
  refreshToken: 'refresh-1',
  expiresAt: 10_000_000,
  user: { id: 'user-1', email: 'pirate@plunder.io' },
}
const PARAMS = {
  matchId: 'm1',
  expectedSeq: 7,
  action: { type: 'endTurn', playerId: 'seat-0' } as const,
}

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

describe('MatchActionClient.submitAction (#261: the single multiplayer write path)', () => {
  it('posts matchId/expectedSeq/action with the session token', async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse(200, { seq: 8, view: { viewerId: 'seat-0' } }))
    const client = new MatchActionClient(CONFIG, fetchMock)

    const result = await client.submitAction(SESSION, PARAMS)

    const [url, init] = fetchMock.mock.calls[0]!
    expect(url).toBe('https://proj.supabase.co/functions/v1/submit-action')
    const request = init as RequestInit
    expect(request.method).toBe('POST')
    expect(request.headers).toMatchObject({ apikey: 'anon-key', Authorization: 'Bearer access-1' })
    expect(JSON.parse(request.body as string)).toEqual(PARAMS)
    expect(result.seq).toBe(8)
  })

  it('marks SEQ_CONFLICT as stale (§9 step 3: refetch, never patch)', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValueOnce(
      jsonResponse(409, {
        error: { code: 'SEQ_CONFLICT', message: 'Your view is stale; refetch and retry' },
      }),
    )
    const client = new MatchActionClient(CONFIG, fetchMock)

    const err = await client.submitAction(SESSION, PARAMS).catch((e: unknown) => e)
    expect(err).toBeInstanceOf(MatchActionError)
    expect((err as MatchActionError).code).toBe('SEQ_CONFLICT')
    expect((err as MatchActionError).isStale).toBe(true)
  })

  it('marks NOT_YOUR_TURN as stale too (a sweep skip or second tab acted first)', async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        jsonResponse(403, { error: { code: 'NOT_YOUR_TURN', message: "It is seat-1's turn" } }),
      )
    const client = new MatchActionClient(CONFIG, fetchMock)

    const err = await client.submitAction(SESSION, PARAMS).catch((e: unknown) => e)
    expect((err as MatchActionError).isStale).toBe(true)
  })

  it('surfaces INVALID_ACTION as a non-stale, user-facing error', async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        jsonResponse(400, { error: { code: 'INVALID_ACTION', message: 'Not enough movement' } }),
      )
    const client = new MatchActionClient(CONFIG, fetchMock)

    const err = await client.submitAction(SESSION, PARAMS).catch((e: unknown) => e)
    expect((err as MatchActionError).code).toBe('INVALID_ACTION')
    expect((err as MatchActionError).isStale).toBe(false)
    expect((err as MatchActionError).message).toBe('Not enough movement')
  })

  it('maps a network failure to a codeless, non-stale error', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockRejectedValue(new TypeError('offline'))
    const client = new MatchActionClient(CONFIG, fetchMock)

    const err = await client.submitAction(SESSION, PARAMS).catch((e: unknown) => e)
    expect(err).toBeInstanceOf(MatchActionError)
    expect((err as MatchActionError).code).toBeUndefined()
    expect((err as MatchActionError).isStale).toBe(false)
  })
})
