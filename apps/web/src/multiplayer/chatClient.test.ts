import { describe, expect, it, vi } from 'vitest'
import type { SupabaseConfig } from '../auth/supabaseAuth'
import type { AuthSession } from '../auth/types'
import { ChatClient, ChatError } from './chatClient'

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

describe('ChatClient.send', () => {
  it('posts to send-chat with the anon key, bearer token, and exact body contract', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValueOnce(jsonResponse(200, { id: 7 }))
    const client = new ChatClient(CONFIG, fetchMock)

    const id = await client.send(SESSION, MATCH_ID, 'all', 'hoist the colors')

    expect(id).toBe(7)
    const [url, init] = fetchMock.mock.calls[0]!
    expect(url).toBe('https://proj.supabase.co/functions/v1/send-chat')
    const reqInit = init as RequestInit
    expect(reqInit.method).toBe('POST')
    expect(reqInit.headers).toMatchObject({
      apikey: 'anon-key',
      Authorization: 'Bearer access-1',
    })
    expect(JSON.parse(reqInit.body as string)).toEqual({
      matchId: MATCH_ID,
      channel: 'all',
      body: 'hoist the colors',
    })
  })

  it('throws ChatError with the server message on rejection (e.g. rate limit)', async () => {
    const errorBody = { error: { code: 'RATE_LIMITED', message: 'You are sending too fast' } }
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse(429, errorBody))
      .mockResolvedValueOnce(jsonResponse(429, errorBody))
    const client = new ChatClient(CONFIG, fetchMock)

    await expect(client.send(SESSION, MATCH_ID, 'all', 'spam')).rejects.toThrow(/sending too fast/)
    await expect(client.send(SESSION, MATCH_ID, 'all', 'spam')).rejects.toBeInstanceOf(ChatError)
  })

  it('throws a plain-English error when the network request itself fails', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockRejectedValueOnce(new Error('offline'))
    const client = new ChatClient(CONFIG, fetchMock)

    await expect(client.send(SESSION, MATCH_ID, 'alliance', 'ahoy')).rejects.toThrow(
      /Could not reach the server/,
    )
  })
})

describe('ChatClient.fetchMessages', () => {
  it('queries match_chat scoped to the match and channel, ordered by id', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValueOnce(
      jsonResponse(200, [
        { id: 1, seat: 0, channel: 'all', body: 'ahoy', created_at: '2026-07-05T00:00:00Z' },
        { id: 2, seat: 1, channel: 'all', body: 'ahoy back', created_at: '2026-07-05T00:00:01Z' },
      ]),
    )
    const client = new ChatClient(CONFIG, fetchMock)

    const messages = await client.fetchMessages(SESSION, MATCH_ID, 'all')

    expect(messages).toEqual([
      { id: 1, seat: 0, channel: 'all', body: 'ahoy', createdAt: '2026-07-05T00:00:00Z' },
      { id: 2, seat: 1, channel: 'all', body: 'ahoy back', createdAt: '2026-07-05T00:00:01Z' },
    ])
    const [url] = fetchMock.mock.calls[0]!
    expect(url).toContain(`match_id=eq.${MATCH_ID}`)
    expect(url).toContain('channel=eq.all')
    expect(url).toContain('order=id.asc')
    expect(url).not.toContain('id=gt.')
  })

  it('adds an id=gt filter when afterId is given, for incremental refetches', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValueOnce(jsonResponse(200, []))
    const client = new ChatClient(CONFIG, fetchMock)

    await client.fetchMessages(SESSION, MATCH_ID, 'alliance', 5)

    const [url] = fetchMock.mock.calls[0]!
    expect(url).toContain('channel=eq.alliance')
    expect(url).toContain('id=gt.5')
  })

  it('throws on a non-OK response instead of failing open', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValueOnce(jsonResponse(500, {}))
    const client = new ChatClient(CONFIG, fetchMock)

    await expect(client.fetchMessages(SESSION, MATCH_ID, 'all')).rejects.toThrow(
      /Could not load chat/,
    )
  })

  it('returns an empty list rather than throw when the body is not an array', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValueOnce(jsonResponse(200, null))
    const client = new ChatClient(CONFIG, fetchMock)

    await expect(client.fetchMessages(SESSION, MATCH_ID, 'all')).resolves.toEqual([])
  })
})
