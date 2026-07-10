import { describe, expect, it, vi } from 'vitest'
import type { SupabaseConfig } from '../auth/supabaseAuth'
import type { AuthSession } from '../auth/types'
import { MatchActionError } from './matchActionClient'
import { BattleSessionClient } from './battleSessionClient'

const CONFIG: SupabaseConfig = { url: 'https://proj.supabase.co', anonKey: 'anon-key' }
const SESSION: AuthSession = {
  accessToken: 'access-1',
  refreshToken: 'refresh-1',
  expiresAt: 10_000_000,
  user: { id: 'user-1', email: 'pirate@plunder.io' },
}

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

describe('BattleSessionClient (#408 interactive-combat transport)', () => {
  it('battle-open posts the attack identity with the session token', async () => {
    const ctx = { round: 1, available: ['broadside'] }
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        jsonResponse(200, { seq: 4, outcome: { kind: 'awaitingTactic', ctx } }),
      )
    const client = new BattleSessionClient(CONFIG, fetchMock)

    const params = { matchId: 'm1', expectedSeq: 4, captainId: 'cap-a', targetCaptainId: 'cap-b' }
    const result = await client.open(SESSION, params)

    const [url, init] = fetchMock.mock.calls[0]!
    expect(url).toBe('https://proj.supabase.co/functions/v1/battle-open')
    const request = init as RequestInit
    expect(request.headers).toMatchObject({ apikey: 'anon-key', Authorization: 'Bearer access-1' })
    expect(JSON.parse(request.body as string)).toEqual(params)
    expect(result).toEqual({ seq: 4, outcome: { kind: 'awaitingTactic', ctx } })
  })

  it('battle-round posts the per-side CAS token and the order', async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        jsonResponse(200, { outcome: { kind: 'resolved', seq: 6, view: {}, battleReport: {} } }),
      )
    const client = new BattleSessionClient(CONFIG, fetchMock)

    await client.round(SESSION, { matchId: 'm1', expectedOrders: 2, order: { tactic: 'ram' } })

    const [url, init] = fetchMock.mock.calls[0]!
    expect(url).toBe('https://proj.supabase.co/functions/v1/battle-round')
    expect(JSON.parse((init as RequestInit).body as string)).toEqual({
      matchId: 'm1',
      expectedOrders: 2,
      order: { tactic: 'ram' },
    })
  })

  it('battle-auto returns the attacker resolution', async () => {
    const report = { winnerId: 'seat-0', rounds: [], escapedId: null }
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        jsonResponse(200, { seq: 9, view: { viewerId: 'seat-0' }, battleReport: report }),
      )
    const client = new BattleSessionClient(CONFIG, fetchMock)

    const result = await client.auto(SESSION, { matchId: 'm1' })
    expect(result).toEqual({ seq: 9, view: { viewerId: 'seat-0' }, battleReport: report })
  })

  it('maps a stale-session SEQ_CONFLICT to an isStale MatchActionError', async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        jsonResponse(409, { error: { code: 'SEQ_CONFLICT', message: 'stale' } }),
      )
    const client = new BattleSessionClient(CONFIG, fetchMock)

    let caught: unknown
    try {
      await client.round(SESSION, {
        matchId: 'm1',
        expectedOrders: 0,
        order: { tactic: 'broadside' },
      })
    } catch (e) {
      caught = e
    }
    expect(caught).toBeInstanceOf(MatchActionError)
    expect((caught as MatchActionError).isStale).toBe(true)
  })

  it('surfaces a battle-specific error code (ORDERS_CONFLICT) verbatim', async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        jsonResponse(409, { error: { code: 'ORDERS_CONFLICT', message: 'stale orders' } }),
      )
    const client = new BattleSessionClient(CONFIG, fetchMock)

    let caught: unknown
    try {
      await client.round(SESSION, {
        matchId: 'm1',
        expectedOrders: 0,
        order: { tactic: 'broadside' },
      })
    } catch (e) {
      caught = e
    }
    expect((caught as MatchActionError).code).toBe('ORDERS_CONFLICT')
    expect((caught as MatchActionError).isStale).toBe(false)
  })
})
