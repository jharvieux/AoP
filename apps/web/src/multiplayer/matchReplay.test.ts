import { describe, expect, it, vi } from 'vitest'
import type { SupabaseConfig } from '../auth/supabaseAuth'
import type { AuthSession } from '../auth/types'
import { CLIENT_ENGINE_VERSION, MatchReplayClient, ReplayVersionMismatchError } from './matchReplay'

const CONFIG: SupabaseConfig = { url: 'https://proj.supabase.co', anonKey: 'anon-key' }
const SESSION: AuthSession = {
  accessToken: 'access-1',
  refreshToken: 'refresh-1',
  expiresAt: 10_000_000,
  user: { id: 'user-1', email: 'cap@plunder.io' },
}
const MATCH_ID = 'match-1'

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

/** Mocks the three-call sequence loadMatchReplay makes in the happy path:
 * matches, then match_players, then match_actions (profiles is skipped when
 * every seat is AI). */
function mockHappyPath(fetchMock: ReturnType<typeof vi.fn>) {
  fetchMock
    .mockResolvedValueOnce(
      jsonResponse(200, [
        {
          id: MATCH_ID,
          status: 'finished',
          seed: 99,
          settings: { mapSize: 'small' },
          engine_version: CLIENT_ENGINE_VERSION,
        },
      ]),
    )
    .mockResolvedValueOnce(
      jsonResponse(200, [
        { seat: 0, user_id: null, faction: 'pirates' },
        { seat: 1, user_id: null, faction: 'british' },
      ]),
    )
    .mockResolvedValueOnce(
      jsonResponse(200, [
        { seq: 1, action: { type: 'endTurn', playerId: 'seat-0' } },
        { seq: 2, action: { type: 'endTurn', playerId: 'seat-1' } },
      ]),
    )
}

describe('MatchReplayClient.loadMatchReplay', () => {
  it('loads config + actions for a finished match on the pinned engine version', async () => {
    const fetchMock = vi.fn<typeof fetch>()
    mockHappyPath(fetchMock)
    const client = new MatchReplayClient(CONFIG, fetchMock)

    const data = await client.loadMatchReplay(SESSION, MATCH_ID)

    expect(data.config.seed).toBe(99)
    expect(data.config.mapSize).toBe('small')
    expect(data.config.players.map((p) => p.id)).toEqual(['seat-0', 'seat-1'])
    expect(data.actions).toEqual([
      { type: 'endTurn', playerId: 'seat-0' },
      { type: 'endTurn', playerId: 'seat-1' },
    ])

    const [matchesUrl, matchesInit] = fetchMock.mock.calls[0]!
    expect(matchesUrl).toContain('/rest/v1/matches?id=eq.match-1')
    expect((matchesInit as RequestInit).headers).toMatchObject({
      apikey: 'anon-key',
      Authorization: 'Bearer access-1',
    })
  })

  it('looks up display names for human seats via profiles', async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        jsonResponse(200, [
          {
            id: MATCH_ID,
            status: 'finished',
            seed: 1,
            settings: { mapSize: 'small' },
            engine_version: CLIENT_ENGINE_VERSION,
          },
        ]),
      )
      .mockResolvedValueOnce(
        jsonResponse(200, [
          { seat: 0, user_id: 'user-1', faction: 'pirates' },
          { seat: 1, user_id: null, faction: 'british' },
        ]),
      )
      .mockResolvedValueOnce(jsonResponse(200, [{ id: 'user-1', display_name: 'Captain Ahab' }]))
      .mockResolvedValueOnce(jsonResponse(200, []))
    const client = new MatchReplayClient(CONFIG, fetchMock)

    const data = await client.loadMatchReplay(SESSION, MATCH_ID)

    expect(data.config.players[0]).toMatchObject({ id: 'seat-0', name: 'Captain Ahab' })
    expect(data.config.players[1]).toMatchObject({ id: 'seat-1', name: 'AI 1' })
    expect(fetchMock).toHaveBeenCalledTimes(4)
  })

  it('refuses with a plain-English message on an engine version mismatch', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValueOnce(
      jsonResponse(200, [
        {
          id: MATCH_ID,
          status: 'finished',
          seed: 1,
          settings: { mapSize: 'small' },
          engine_version: '0.0.0-old',
        },
      ]),
    )
    const client = new MatchReplayClient(CONFIG, fetchMock)

    await expect(client.loadMatchReplay(SESSION, MATCH_ID)).rejects.toThrow(
      ReplayVersionMismatchError,
    )
    // Only the matches read should happen — no point loading seats/actions
    // for a replay we already know we must refuse.
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('refuses a match that has not finished yet', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValueOnce(
      jsonResponse(200, [
        {
          id: MATCH_ID,
          status: 'active',
          seed: 1,
          settings: { mapSize: 'small' },
          engine_version: CLIENT_ENGINE_VERSION,
        },
      ]),
    )
    const client = new MatchReplayClient(CONFIG, fetchMock)

    await expect(client.loadMatchReplay(SESSION, MATCH_ID)).rejects.toThrow(/finished/)
  })

  it('reports a not-found/not-seated match without leaking which is which', async () => {
    // RLS returns an empty array for both a nonexistent match and one the
    // caller doesn't hold a seat in — same response, same message.
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValueOnce(jsonResponse(200, []))
    const client = new MatchReplayClient(CONFIG, fetchMock)

    await expect(client.loadMatchReplay(SESSION, MATCH_ID)).rejects.toThrow(/No such match/)
  })

  it('throws on a non-OK response instead of failing open', async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse(500, { error: 'boom' }))
    const client = new MatchReplayClient(CONFIG, fetchMock)

    await expect(client.loadMatchReplay(SESSION, MATCH_ID)).rejects.toThrow(
      /Could not load replay data/,
    )
  })
})
