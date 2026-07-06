import { describe, expect, it, vi } from 'vitest'
import type { SupabaseConfig } from '../auth/supabaseAuth'
import type { AuthSession } from '../auth/types'
import { BoardingProbeClient, BoardingProbeError } from './boardingProbeClient'

const CONFIG: SupabaseConfig = { url: 'https://proj.supabase.co', anonKey: 'anon-key' }
const SESSION: AuthSession = {
  accessToken: 'access-1',
  refreshToken: 'refresh-1',
  expiresAt: 10_000_000,
  user: { id: 'user-1', email: 'pirate@plunder.io' },
}
const PARAMS = {
  matchId: 'm1',
  captainId: 'cap-a',
  targetCaptainId: 'cap-b',
  commands: [],
}

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

describe('BoardingProbeClient.probe (#285: the multiplayer boarding-melee probe)', () => {
  it('posts matchId/captainId/targetCaptainId/commands with the session token', async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        jsonResponse(200, { kind: 'resolved', report: { winnerId: 'seat-0' } }),
      )
    const client = new BoardingProbeClient(CONFIG, fetchMock)

    const result = await client.probe(SESSION, PARAMS)

    const [url, init] = fetchMock.mock.calls[0]!
    expect(url).toBe('https://proj.supabase.co/functions/v1/probe-boarding')
    const request = init as RequestInit
    expect(request.method).toBe('POST')
    expect(request.headers).toMatchObject({ apikey: 'anon-key', Authorization: 'Bearer access-1' })
    expect(JSON.parse(request.body as string)).toEqual(PARAMS)
    expect(result).toEqual({ kind: 'resolved', report: { winnerId: 'seat-0' } })
  })

  it('returns an awaitingCommand outcome verbatim', async () => {
    const outcome = { kind: 'awaitingCommand', view: { round: 1 } }
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValueOnce(jsonResponse(200, outcome))
    const client = new BoardingProbeClient(CONFIG, fetchMock)

    const result = await client.probe(SESSION, PARAMS)
    expect(result).toEqual(outcome)
  })

  it('surfaces a rejected attack (INVALID_ACTION) with its code and message', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValueOnce(
      jsonResponse(422, {
        error: { code: 'INVALID_ACTION', message: 'Target is not within attack range' },
      }),
    )
    const client = new BoardingProbeClient(CONFIG, fetchMock)

    const err = await client.probe(SESSION, PARAMS).catch((e: unknown) => e)
    expect(err).toBeInstanceOf(BoardingProbeError)
    expect((err as BoardingProbeError).code).toBe('INVALID_ACTION')
    expect((err as BoardingProbeError).message).toBe('Target is not within attack range')
  })

  it('maps a network failure to a codeless error', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockRejectedValue(new TypeError('offline'))
    const client = new BoardingProbeClient(CONFIG, fetchMock)

    const err = await client.probe(SESSION, PARAMS).catch((e: unknown) => e)
    expect(err).toBeInstanceOf(BoardingProbeError)
    expect((err as BoardingProbeError).code).toBeUndefined()
  })
})
