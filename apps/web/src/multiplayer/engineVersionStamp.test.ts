import { describe, expect, it } from 'vitest'
import { contentVersion, engineVersionStamp } from '@aop/content'
import { ENGINE_VERSION } from '@aop/shared'
import { CLIENT_ENGINE_VERSION, ReplayVersionMismatchError, MatchReplayClient } from './matchReplay'

/**
 * `engineVersionStamp()` (#251) is what actually gets pinned into
 * `matches.engine_version` and compared by the client replay guard —
 * `ENGINE_VERSION` alone never changes when `@aop/content` does, so the guard
 * could never fire for a pure balance-data deploy. These tests pin the
 * composition and the deterministic hash it depends on.
 */
describe('engineVersionStamp (#251)', () => {
  it('is deterministic: two calls in the same process produce the same value', () => {
    expect(contentVersion()).toBe(contentVersion())
    expect(engineVersionStamp()).toBe(engineVersionStamp())
  })

  it('combines ENGINE_VERSION with the content hash', () => {
    expect(engineVersionStamp()).toBe(`${ENGINE_VERSION}+${contentVersion()}`)
  })

  it('CLIENT_ENGINE_VERSION (matchReplay.ts) is exactly engineVersionStamp()', () => {
    expect(CLIENT_ENGINE_VERSION).toBe(engineVersionStamp())
  })

  it('the replay guard fires when a stored engine_version differs by content alone', async () => {
    // Simulates a match created before a content-only balance change: the
    // engine build tag is unchanged, but the stamp as a whole differs.
    const staleStamp = `${ENGINE_VERSION}+deadbeef`
    expect(staleStamp).not.toBe(CLIENT_ENGINE_VERSION)

    const fetchMock = async () =>
      new Response(
        JSON.stringify([
          { id: 'm1', status: 'finished', settings: { mapSize: 'small' }, engine_version: staleStamp },
        ]),
        { status: 200, headers: { 'content-type': 'application/json' } },
      )
    const client = new MatchReplayClient(
      { url: 'https://proj.supabase.co', anonKey: 'anon-key' },
      fetchMock,
    )
    await expect(
      client.loadMatchReplay(
        {
          accessToken: 'a',
          refreshToken: 'r',
          expiresAt: 1,
          user: { id: 'u1', email: 'cap@plunder.io' },
        },
        'm1',
      ),
    ).rejects.toThrow(ReplayVersionMismatchError)
  })
})
